import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { config } from '@/lib/config';
import { currentRound, roundEntries, settleIfDue, Round } from '@/lib/rounds';
import { poolSummary, roundMsFor } from '@/lib/pool';
import { gameForRound, rotation } from '@/lib/games/rotation';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Avoid recomputing the pool on every poll from every visitor.
type Pool = Awaited<ReturnType<typeof poolSummary>>;
let poolCache: { at: number; pool: Pool | null } = { at: 0, pool: null };
async function cachedPool(): Promise<Pool> {
  if (!poolCache.pool || Date.now() - poolCache.at > 8000) {
    poolCache = { at: Date.now(), pool: await poolSummary() };
  }
  return poolCache.pool!;
}

const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

export async function GET() {
  try {
    // Every visitor's poll also moves the game forward, so rounds settle on time even without a cron job.
    try { await settleIfDue(); } catch (e) { console.error('settle failed', e); }

    const round = await currentRound();
    const [entries, pool] = await Promise.all([roundEntries(round.id), cachedPool()]);

    const lastQ = await db().from('rounds').select('*').eq('status', 'settled').not('seed', 'is', null).order('id', { ascending: false }).limit(1);
    const last = (lastQ.data?.[0] ?? null) as Round | null;
    let lastRound = null;
    if (last && last.seed != null) {
      const le = await roundEntries(last.id);
      lastRound = {
        id: last.id,
        game: gameForRound(last.id).key,
        seed: Number(last.seed),
        blockhash: last.blockhash,
        settledAt: last.settled_at,
        payoutLamports: Number(last.payout_lamports ?? 0),
        practice: !!last.practice,
        players: le.map((e) => ({ handle: e.handle || short(e.wallet), wallet: e.wallet })),
      };
    }

    const winQ = await db().from('payouts').select('round_id, wallet, handle, lamports, status, tx_signature')
      .neq('status', 'skipped').order('round_id', { ascending: false }).limit(10);

    return NextResponse.json({
      now: Date.now(),
      round: {
        id: round.id,
        game: gameForRound(round.id).key,
        endsAt: new Date(round.ends_at).getTime(),
        players: entries.map((e) => ({ handle: e.handle || short(e.wallet), wallet: e.wallet })),
      },
      poolLamports: pool.lamports,
      poolInfo: {
        solUsd: pool.solUsd, volumeH24Usd: pool.volumeH24Usd, feePct: config.creatorFeePct,
        unlocked: pool.unlocked, minLamports: pool.minLamports,
      },
      payoutShare: config.payoutShare,
      maxPayoutLamports: Math.round(config.maxPayoutSol * 1e9),
      roundMs: roundMsFor(pool.lamports, pool.unlocked),
      tiers: config.roundTiers,
      rotation: rotation().map((g) => g.key),
      tokenMint: config.tokenMint,
      lastRound,
      winners: (winQ.data ?? []).map((p) => ({
        round: p.round_id, handle: p.handle || short(p.wallet), wallet: p.wallet,
        lamports: Number(p.lamports), status: p.status, tx: p.tx_signature,
      })),
    }, {
      // Let the CDN serve this to every viewer for a second: one database pass per second
      // no matter how many people are watching. Browsers still never cache it.
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=1', 'CDN-Cache-Control': 'public, s-maxage=1' },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'The game server is not reachable right now.' }, { status: 500 });
  }
}
