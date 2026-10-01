import { config } from './config';

// Solana addresses are 32–44 base58 characters.
export function isValidAddress(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

/** A recent finalized blockhash, used as public randomness for the winner draw. */
export async function latestBlockhash(): Promise<string> {
  const r = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'finalized' }] }),
    cache: 'no-store',
  });
  const d = await r.json();
  const hash = d?.result?.value?.blockhash;
  if (typeof hash !== 'string') throw new Error('Could not read a Solana blockhash');
  return hash;
}
