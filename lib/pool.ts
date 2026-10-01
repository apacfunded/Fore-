import { db } from './supabase';
import { config } from './config';
import { dexSnapshot } from './dex';

export type PoolRow = {
  id: number;
  accrued_sol: number;        // creator fees estimated since the site went live
  adjust_sol: number;         // manual correction from the admin page (+ or -)
  last_accrual_at: string | null;
  last_sol_usd: number | null;
  last_volume_h24_usd: number | null;
  unlocked_at: string | null; // when the pool first reached MIN_POOL_SOL
};

async function readRow(): Promise<PoolRow> {
  const r = await db().from('pool_state').select('*').eq('id', 1).single();
  if (r.error || !r.data) throw new Error(r.error?.message ?? 'pool_state row missing. Run supabase/schema.sql.');
  return r.data as PoolRow;
}

/**
 * Adds estimated creator fees for the time since the last update:
 *   minutes passed × (recent trading volume per minute) × creator fee % ÷ SOL price.
 * Uses the shortest DexScreener window that covers the gap. Runs at most every 30 seconds,
 * and only one request wins each update.
 */
export async function accrue(): Promise<PoolRow> {
  const row = await readRow();
  const now = Date.now();

  if (!row.last_accrual_at) {
    await db().from('pool_state').update({ last_accrual_at: new Date(now).toISOString() }).eq('id', 1).is('last_accrual_at', null);
    return readRow();
  }

  const last = new Date(row.last_accrual_at).getTime();
  const minutes = Math.min((now - last) / 60000, 1440);
  if (minutes < 0.5) return row;

  let snap;
  try { snap = await dexSnapshot(); } catch (e) { console.error('dexscreener', e); return row; }

  const v = snap.volumeUsd;
  const perMinute = minutes <= 5 ? v.m5 / 5 : minutes <= 60 ? v.h1 / 60 : minutes <= 360 ? v.h6 / 360 : v.h24 / 1440;
  const addUsd = perMinute * minutes * (config.creatorFeePct / 100);
  const addSol = snap.solUsd > 0 ? addUsd / snap.solUsd : 0;

  const upd = await db().from('pool_state').update({
    accrued_sol: Number(row.accrued_sol) + addSol,
    last_accrual_at: new Date(now).toISOString(),
    last_sol_usd: snap.solUsd,
    last_volume_h24_usd: v.h24,
  }).eq('id', 1).eq('last_accrual_at', row.last_accrual_at).select('*');
  return (upd.data?.[0] as PoolRow) ?? readRow();
}

/** SOL already promised to winners (waiting or sent). Skipped payouts go back into the pool. */
async function committedLamports(): Promise<number> {
  const { data } = await db().from('payouts').select('lamports').in('status', ['pending', 'paid']);
  return (data ?? []).reduce((s, p: { lamports: number }) => s + Number(p.lamports), 0);
}

export async function poolLamports(row?: PoolRow): Promise<number> {
  const r = row ?? (await readRow());
  const earnedSol = config.startingPoolSol + Number(r.adjust_sol) + Number(r.accrued_sol);
  const committed = await committedLamports();
  return Math.max(0, Math.floor(earnedSol * 1e9) - committed);
}

export async function poolSummary() {
  const row = await accrue();
  const lamports = await poolLamports(row);
  return {
    lamports,
    unlocked: await checkUnlock(row, lamports),
    minLamports: Math.round(config.minPoolSol * 1e9),
    solUsd: row.last_sol_usd ? Number(row.last_sol_usd) : null,
    volumeH24Usd: row.last_volume_h24_usd ? Number(row.last_volume_h24_usd) : null,
    updatedAt: row.last_accrual_at,
  };
}

/**
 * Games stay paused until the pool first reaches MIN_POOL_SOL. Once it does,
 * the moment is recorded and games keep running from then on, even after
 * payouts take the pool back below the threshold.
 */
export async function checkUnlock(row?: PoolRow, lamports?: number): Promise<boolean> {
  const r = row ?? (await readRow());
  if (r.unlocked_at) return true;
  const l = lamports ?? (await poolLamports(r));
  if (l < config.minPoolSol * 1e9) return false;
  await db().from('pool_state').update({ unlocked_at: new Date().toISOString() }).eq('id', 1).is('unlocked_at', null);
  return true;
}

/** How long the next round should last, given the pool right now. */
export function roundMsFor(lamports: number, unlocked: boolean): number {
  if (!unlocked) return config.practiceRoundMs;
  const poolSol = lamports / 1e9;
  let seconds = config.roundTiers[0].seconds;
  for (const t of config.roundTiers) if (poolSol >= t.minSol) seconds = t.seconds;
  return seconds * 1000;
}

export async function currentRoundMs(): Promise<number> {
  const row = await accrue();
  const lamports = await poolLamports(row);
  return roundMsFor(lamports, await checkUnlock(row, lamports));
}

/** Admin control: pause games until the pool refills to MIN_POOL_SOL again. */
export async function relock() {
  await db().from('pool_state').update({ unlocked_at: null }).eq('id', 1);
}

export async function adjustPool(deltaSol: number) {
  const row = await readRow();
  const r = await db().from('pool_state').update({ adjust_sol: Number(row.adjust_sol ?? 0) + deltaSol }).eq('id', 1).select('adjust_sol');
  if (r.error) throw new Error(`Couldn't save the pool change: ${r.error.message}`);
  if (!r.data?.length) throw new Error("Couldn't save the pool change: the pool row is missing. Run supabase/schema.sql.");
}
