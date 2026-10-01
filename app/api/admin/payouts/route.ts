import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { db } from '@/lib/supabase';
import { config } from '@/lib/config';
import { adjustPool, poolSummary, relock } from '@/lib/pool';

export const dynamic = 'force-dynamic';

function authed(req: Request) {
  const given = Buffer.from(req.headers.get('x-admin-key') ?? '');
  const real = Buffer.from(config.adminKey);
  return given.length === real.length && timingSafeEqual(given, real);
}
const deny = () => NextResponse.json({ error: 'Wrong admin key.' }, { status: 401 });

export async function GET(req: Request) {
  if (!authed(req)) return deny();
  const [{ data, error }, pool, ps] = await Promise.all([
    db().from('payouts').select('*').order('id', { ascending: false }).limit(100),
    poolSummary(),
    db().from('pool_state').select('*').eq('id', 1).single(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    payouts: data,
    pool: {
      ...pool,
      accruedSol: Number(ps.data?.accrued_sol ?? 0),
      adjustSol: Number(ps.data?.adjust_sol ?? 0),
      startingSol: config.startingPoolSol,
      feePct: config.creatorFeePct,
    },
  });
}

export async function POST(req: Request) {
  if (!authed(req)) return deny();
  const body = await req.json().catch(() => ({}));

  if (body.action === 'adjust') {
    const delta = Number(body.deltaSol);
    if (!Number.isFinite(delta) || delta === 0) return NextResponse.json({ error: 'Enter an amount in SOL, like 0.5 or -0.2.' }, { status: 400 });
    await adjustPool(delta);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'relock') {
    await relock();
    return NextResponse.json({ ok: true });
  }

  const p = await db().from('payouts').select('*').eq('id', body.id).single();
  if (!p.data) return NextResponse.json({ error: 'Payout not found.' }, { status: 404 });

  if (body.action === 'skip' && p.data.status === 'pending') {
    await db().from('payouts').update({ status: 'skipped' }).eq('id', body.id).eq('status', 'pending');
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'paid' && p.data.status === 'pending') {
    const sig = typeof body.signature === 'string' ? body.signature.trim() : '';
    if (sig && !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(sig)) {
      return NextResponse.json({ error: 'That doesn’t look like a Solana transaction signature. Leave it blank or paste it from Solscan or Phantom.' }, { status: 400 });
    }
    await db().from('payouts')
      .update({ status: 'paid', tx_signature: sig || null, paid_at: new Date().toISOString() })
      .eq('id', body.id).eq('status', 'pending');
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'reopen' && p.data.status !== 'pending') {
    await db().from('payouts').update({ status: 'pending', tx_signature: null, paid_at: null }).eq('id', body.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'That payout was already handled.' }, { status: 409 });
}
