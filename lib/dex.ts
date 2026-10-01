import { config } from './config';

export type DexSnapshot = {
  volumeUsd: { m5: number; h1: number; h6: number; h24: number };
  solUsd: number;       // price of 1 SOL in USD
  priceUsd: number;     // price of the coin in USD
  pairs: number;
};

type Pair = {
  dexId?: string;
  priceUsd?: string | null;
  priceNative?: string;
  quoteToken?: { symbol?: string | null };
  liquidity?: { usd?: number | null };
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
};

/**
 * Reads the coin's trading volume across every DexScreener pair
 * (the pump.fun bonding curve and any PumpSwap/Raydium pools after graduation).
 */
export async function dexSnapshot(): Promise<DexSnapshot> {
  const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${config.tokenMint}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`DexScreener returned ${r.status}`);
  const pairs = (await r.json()) as Pair[];
  if (!Array.isArray(pairs) || pairs.length === 0) throw new Error('DexScreener has no pairs for this coin yet');

  const vol = { m5: 0, h1: 0, h6: 0, h24: 0 };
  for (const p of pairs) {
    vol.m5 += p.volume?.m5 ?? 0;
    vol.h1 += p.volume?.h1 ?? 0;
    vol.h6 += p.volume?.h6 ?? 0;
    vol.h24 += p.volume?.h24 ?? 0;
  }

  // SOL price = coin price in USD / coin price in SOL, from the deepest SOL-quoted pair.
  const solPairs = pairs
    .filter((p) => (p.quoteToken?.symbol ?? '').toUpperCase() === 'SOL' && Number(p.priceUsd) > 0 && Number(p.priceNative) > 0)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const ref = solPairs[0];
  if (!ref) throw new Error('No SOL pair on DexScreener to price SOL from');
  const priceUsd = Number(ref.priceUsd);
  const solUsd = priceUsd / Number(ref.priceNative);

  return { volumeUsd: vol, solUsd, priceUsd, pairs: pairs.length };
}
