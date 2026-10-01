import { createHash } from 'crypto';
import { db } from './supabase';
import { config } from './config';
import { latestBlockhash } from './chain';
import { accrue, checkUnlock, currentRoundMs, poolLamports } from './pool';
import { seedFromHex, winnerIndex } from './game';

export type Round = {
  id: number;
  status: 'open' | 'settling' | 'settled';
  starts_at: string;
  ends_at: string;
  blockhash: string | null;
  seed: number | null;
  entry_count: number | null;
  winner_entry_id: number | null;
  pool_lamports: number | null;
  payout_lamports: number | null;
  practice: boolean;
  settled_at: string | null;
};

export type Entry = { id: number; round_id: number; wallet: string; handle: string | null; callout_url: string; created_at: string };

/** Returns the open round, creating one if none exists. */
export async function currentRound(): Promise<Round> {
  const { data } = await db().from('rounds').select('*').eq('status', 'open').order('id', { ascending: false }).limit(1);
  if (data && data[0]) return data[0] as Round;
  const endsAt = new Date(Date.now() + (await currentRoundMs())).toISOString();
  const ins = await db().from('rounds').insert({ ends_at: endsAt }).select('*').single();
  if (ins.data) return ins.data as Round;
  // Another request created it at the same moment; read it back.
  const again = await db().from('rounds').select('*').eq('status', 'open').limit(1).single();
  if (again.data) return again.data as Round;
  throw new Error(ins.error?.message ?? 'Could not open a round');
}

export async function roundEntries(roundId: number): Promise<Entry[]> {
  const { data, error } = await db().from('entries').select('*').eq('round_id', roundId).order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Entry[];
}

/**
 * Settles the open round if its time is up. Safe to call from many requests at once:
 * only the request that flips the round from 'open' to 'settling' does the work.
 */
export async function settleIfDue(): Promise<{ settled: boolean; roundId?: number }> {
  await retryStuck();
  const round = await currentRound();
  const endsAt = new Date(round.ends_at).getTime();
  if (endsAt > Date.now()) {
    // If the pool grew into a faster tier mid-round, bring the tee off forward (never push it back).
    const tierMs = await currentRoundMs();
    if (endsAt - Date.now() > tierMs + 5000) {
      await db().from('rounds').update({ ends_at: new Date(Date.now() + tierMs).toISOString() })
        .eq('id', round.id).eq('status', 'open').eq('ends_at', round.ends_at);
    }
    return { settled: false };
  }

  const entries = await roundEntries(round.id);
  if (entries.length === 0) {
    // Nobody called out. Keep the same round open for another minute; the pool rolls over.
    await db().from('rounds')
      .update({ ends_at: new Date(Date.now() + (await currentRoundMs())).toISOString() })
      .eq('id', round.id).eq('status', 'open');
    return { settled: false };
  }

  const claim = await db().from('rounds').update({ status: 'settling' })
    .eq('id', round.id).eq('status', 'open').select('id');
  if (!claim.data || claim.data.length === 0) return { settled: false }; // someone else is settling it

  await settleRound(round.id);
  await db().from('rounds').insert({ ends_at: new Date(Date.now() + (await currentRoundMs())).toISOString() });
  return { settled: true, roundId: round.id };
}

/**
 * A round that failed mid-settle (RPC hiccup, timeout) stays 'settling'.
 * After two minutes, one request re-claims it and finishes the job.
 */
async function retryStuck() {
  const cutoff = new Date(Date.now() - 120_000).toISOString();
  const stuck = await db().from('rounds').select('id, ends_at').eq('status', 'settling').lt('ends_at', cutoff).limit(1);
  const r = stuck.data?.[0];
  if (!r) return;
  const claim = await db().from('rounds').update({ ends_at: new Date().toISOString() })
    .eq('id', r.id).eq('status', 'settling').eq('ends_at', r.ends_at).select('id');
  if (!claim.data || claim.data.length === 0) return;
  try { await settleRound(r.id); } catch (e) { console.error('retry settle failed', e); }
}

/** Picks the winner and queues the payout for a round already marked 'settling'. */
async function settleRound(roundId: number) {
  const final = await roundEntries(roundId);
  if (final.length === 0) {
    await db().from('rounds').update({ status: 'settled', entry_count: 0, settled_at: new Date().toISOString() })
      .eq('id', roundId).eq('status', 'settling');
    return;
  }

  // Lock in the blockhash first, so a retry after a failure draws the same winner.
  const row = await db().from('rounds').select('blockhash').eq('id', roundId).single();
  let blockhash = row.data?.blockhash as string | null;
  if (!blockhash) {
    blockhash = await latestBlockhash();
    const save = await db().from('rounds').update({ blockhash }).eq('id', roundId).eq('status', 'settling');
    if (save.error) throw new Error(save.error.message);
  }
  const hex = createHash('sha256').update(`${blockhash}:${roundId}`).digest('hex');
  const seed = seedFromHex(hex);
  const w = final[winnerIndex(seed, final.length)];

  // Queue the payout (one per round, enforced by the database), or reuse it if a previous attempt got that far.
  const existing = await db().from('payouts').select('lamports').eq('round_id', roundId).maybeSingle();
  let payout: number;
  let pool: number;
  let practice = false;
  if (existing.data) {
    payout = Number(existing.data.lamports);
    pool = Math.round(payout / config.payoutShare);
  } else {
    const row = await accrue();
    pool = await poolLamports(row);
    // Until the pool first reaches MIN_POOL_SOL, rounds are practice: a winner is drawn but nothing is paid.
    practice = !(await checkUnlock(row, pool));
    // 10% of the pool, capped at MAX_PAYOUT_SOL per win.
    payout = practice ? 0 : Math.floor(Math.min(pool * config.payoutShare, config.maxPayoutSol * 1e9));
    if (payout > 0) {
      const pay = await db().from('payouts').insert({
        round_id: roundId, entry_id: w.id, wallet: w.wallet, handle: w.handle, lamports: payout,
      });
      if (pay.error) throw new Error(pay.error.message);
    }
  }

  const upd = await db().from('rounds').update({
    status: 'settled',
    seed,
    entry_count: final.length,
    practice,
    winner_entry_id: w.id,
    pool_lamports: pool,
    payout_lamports: payout,
    settled_at: new Date().toISOString(),
  }).eq('id', roundId).eq('status', 'settling');
  if (upd.error) throw new Error(upd.error.message);
}
