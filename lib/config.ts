// Server-only settings, read from environment variables.
import { LAUNCHED_MINT } from './token';
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
}

export const config = {
  get supabaseUrl() { return req('SUPABASE_URL'); },
  get supabaseKey() { return req('SUPABASE_SERVICE_ROLE_KEY'); },
  get rpcUrl() { return process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'; },
  // The Vercel setting wins when it holds a real address; otherwise use the one saved in lib/token.ts.
  get tokenMint() {
    const env = (process.env.TOKEN_MINT ?? '').trim();
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(env) ? env : LAUNCHED_MINT || 'pending';
  },
  /** The game only runs once the coin's CA is set. */
  get launched() { return this.tokenMint !== 'pending'; },
  get creatorFeePct() { return Number(process.env.CREATOR_FEE_PCT ?? '0.30'); },
  get startingPoolSol() { return Number(process.env.STARTING_POOL_SOL ?? '0'); },
  get minPoolSol() { return Number(process.env.MIN_POOL_SOL ?? '0'); },
  get maxPayoutSol() { return Number(process.env.MAX_PAYOUT_SOL ?? '0.5'); },
  get payoutShare() { return Number(process.env.PAYOUT_SHARE ?? '0.10'); },
  get practiceRoundMs() { return Number(process.env.PRACTICE_ROUND_SECONDS ?? '60') * 1000; },
  /**
   * Round length by pool size, as "minPoolSol:seconds" pairs. The bigger the pool, the faster rounds come.
   * Default: under 10 SOL every 5 min, 10+ every 3 min, 25+ every 2 min, 50+ every minute, 100+ every 30 sec.
   */
  get roundTiers(): { minSol: number; seconds: number }[] {
    const raw = process.env.ROUND_TIERS || '0:300,10:180,25:120,50:60,100:30';
    const tiers = raw.split(',').map((t) => {
      const [a, b] = t.split(':').map(Number);
      return { minSol: a, seconds: b };
    }).filter((t) => Number.isFinite(t.minSol) && t.seconds > 0).sort((x, y) => x.minSol - y.minSol);
    return tiers.length ? tiers : [{ minSol: 0, seconds: 60 }];
  },
  get adminKey() { return req('ADMIN_KEY'); },
  get cronSecret() { return process.env.CRON_SECRET ?? ''; },
};
