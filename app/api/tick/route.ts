import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { settleIfDue } from '@/lib/rounds';

export const dynamic = 'force-dynamic';

// Optional heartbeat. Point a cron service at /api/tick every minute with
// the header  Authorization: Bearer <CRON_SECRET>  so rounds settle even when nobody has the site open.
export async function GET(req: Request) {
  if (!config.cronSecret || req.headers.get('authorization') !== `Bearer ${config.cronSecret}`) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }
  try {
    return NextResponse.json(await settleIfDue());
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Settle failed' }, { status: 500 });
  }
}
