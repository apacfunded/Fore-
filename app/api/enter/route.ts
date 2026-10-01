import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/supabase';
import { config } from '@/lib/config';
import { currentRound } from '@/lib/rounds';
import { isValidAddress } from '@/lib/chain';
import { CALLOUT_RE, HANDLE_RE, normalizeCallout } from '@/lib/entry';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

function clientIpHash(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';
  if (!ip) return null;
  return createHash('sha256').update(`${config.adminKey}:${ip}`).digest('hex').slice(0, 32);
}

export async function POST(req: Request) {
  let body: { wallet?: string; handle?: string; calloutUrl?: string; roundId?: number };
  try { body = await req.json(); } catch { return fail('Bad request.'); }

  const wallet = (body.wallet ?? '').trim();
  const rawUrl = (body.calloutUrl ?? '').trim();
  let handle = (body.handle ?? '').trim();

  if (!CALLOUT_RE.test(rawUrl)) return fail('Paste the link to your callout on pump.fun.');
  if (!isValidAddress(wallet)) return fail('Enter the Solana address you want to be paid to.');
  if (handle) {
    if (!HANDLE_RE.test(handle)) return fail('Names use letters, numbers and underscores, up to 20 characters.');
    if (!handle.startsWith('@')) handle = '@' + handle;
  }

  const round = await currentRound();
  if (Number(body.roundId) !== round.id || new Date(round.ends_at).getTime() <= Date.now() + 1500) {
    return fail('That round just teed off. Enter again for the next one.', 409);
  }

  const ins = await db().from('entries').insert({
    round_id: round.id, wallet, handle: handle || null,
    callout_url: normalizeCallout(rawUrl), ip_hash: clientIpHash(req),
  }).select('id').single();

  if (ins.error) {
    const msg = ins.error.message || '';
    if (msg.includes('entries_round_id_wallet_key')) return fail('That address is already on the tee this round.', 409);
    if (msg.includes('entries_round_id_ip_hash_key')) return fail('Someone on your connection already entered this round. One ball per person.', 409);
    if (msg.includes('entries_callout_url_key')) return fail('That link was already used. Post a new callout and paste its link.', 409);
    console.error(ins.error);
    return fail('Could not save your entry. Try again.', 500);
  }

  // The round may have closed in the moment between the check and the insert.
  const still = await db().from('rounds').select('status').eq('id', round.id).single();
  if (still.data?.status !== 'open') {
    await db().from('entries').delete().eq('id', ins.data.id);
    return fail('That round just teed off. Enter again for the next one.', 409);
  }

  return NextResponse.json({ ok: true, roundId: round.id });
}
