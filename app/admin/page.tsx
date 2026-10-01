'use client';
import { useCallback, useEffect, useState } from 'react';

type Payout = { id: number; round_id: number; wallet: string; handle: string | null; lamports: number; status: string; tx_signature: string | null; created_at: string };
type Pool = { lamports: number; unlocked: boolean; minLamports: number; solUsd: number | null; volumeH24Usd: number | null; accruedSol: number; adjustSol: number; startingSol: number; feePct: number };
const sol = (l: number) => (Number(l) / 1e9).toFixed(4);

export default function Admin() {
  const [key, setKey] = useState('');
  const [data, setData] = useState<{ payouts: Payout[]; pool: Pool } | null>(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [sigs, setSigs] = useState<Record<number, string>>({});
  const [delta, setDelta] = useState('');
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => { try { setKey(sessionStorage.getItem('cob-admin') ?? ''); } catch {} }, []);

  const load = useCallback(async (k = key) => {
    setErr('');
    const r = await fetch('/api/admin/payouts', { headers: { 'x-admin-key': k }, cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) { setData(null); return setErr(d.error || 'Could not load payouts.'); }
    try { sessionStorage.setItem('cob-admin', k); } catch {}
    setData(d);
  }, [key]);

  async function post(body: object, done: string) {
    setErr(''); setNote('');
    const r = await fetch('/api/admin/payouts', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': key }, body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) setErr(d.error || 'Update failed.'); else setNote(done);
    await load();
  }

  async function copy(p: Payout) {
    try { await navigator.clipboard.writeText(p.wallet); setCopied(p.id); setTimeout(() => setCopied(null), 1500); }
    catch { setErr('Copy failed. Select the address and copy it by hand.'); }
  }

  const pending = data?.payouts.filter((p) => p.status === 'pending') ?? [];
  const done = data?.payouts.filter((p) => p.status !== 'pending') ?? [];
  const owed = pending.reduce((s, p) => s + Number(p.lamports), 0);
  const paid = done.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.lamports), 0);

  return (
    <div className="wrap" style={{ maxWidth: 960 }}>
      <header className="top">
        <div><h1>PAYOUT <span>DESK</span></h1><p className="tag">Send winnings from any wallet, then mark them paid here.</p></div>
      </header>

      <div className="card">
        <p className="label">Admin key</p>
        <form className="enter" style={{ flexDirection: 'row' }} onSubmit={(e) => { e.preventDefault(); load(); }}>
          <input id="key" type="password" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Admin key" />
          <button className="btn" type="submit">Load</button>
        </form>
        {err && <p className="msg err">{err}</p>}
        {note && <p className="msg ok">{note}</p>}
      </div>

      {data && (
        <div className="card">
          <h2>Pool</h2>
          <table><tbody>
            <tr><td>Estimated creator fees since launch</td><td className="r">{data.pool.accruedSol.toFixed(4)} SOL</td></tr>
            <tr><td>Starting pool (setting)</td><td className="r">{data.pool.startingSol.toFixed(4)} SOL</td></tr>
            <tr><td>Your corrections</td><td className="r">{data.pool.adjustSol >= 0 ? '+' : ''}{data.pool.adjustSol.toFixed(4)} SOL</td></tr>
            <tr><td>Promised to winners (waiting + paid)</td><td className="r">−{sol(owed + paid)} SOL</td></tr>
            <tr className="win"><td><b>Pool players see</b></td><td className="r">{sol(data.pool.lamports)} SOL</td></tr>
            <tr>
              <td>Rounds</td>
              <td className="r">
                {data.pool.unlocked
                  ? <>Paying out · <button className="btn" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => post({ action: 'relock' }, `Back to practice rounds until the pool is ${sol(data.pool.minLamports)} SOL.`)}>Practice until {sol(data.pool.minLamports)} SOL</button></>
                  : <>Practice rounds, no payouts until the pool reaches {sol(data.pool.minLamports)} SOL</>}
              </td>
            </tr>
          </tbody></table>
          <p className="hint" style={{ marginTop: 8 }}>
            Estimate uses {data.pool.feePct}% of DexScreener volume
            {data.pool.volumeH24Usd != null ? ` (24h volume $${Math.round(data.pool.volumeH24Usd).toLocaleString()})` : ''}.
            If your real creator rewards differ, correct the pool below.
          </p>
          <form className="enter" style={{ flexDirection: 'row' }} onSubmit={(e) => { e.preventDefault(); post({ action: 'adjust', deltaSol: Number(delta) }, 'Pool updated.'); setDelta(''); }}>
            <input id="delta" inputMode="decimal" placeholder="Add or remove SOL, e.g. 0.5 or -0.2" value={delta} onChange={(e) => setDelta(e.target.value)} aria-label="Pool correction in SOL" />
            <button className="btn" type="submit">Apply</button>
          </form>
        </div>
      )}

      {data && (
        <div className="card">
          <h2>Waiting to send · {sol(owed)} SOL</h2>
          {pending.length === 0 ? <p className="empty">Nothing owed right now.</p> : (
            <div className="tbl"><table>
              <thead><tr><th>Round</th><th>Winner</th><th>Send</th><th>Transaction (optional)</th><th></th></tr></thead>
              <tbody>{pending.map((p) => (
                <tr key={p.id}>
                  <td>{p.round_id}</td>
                  <td className="h">
                    {p.handle && <div>{p.handle}</div>}
                    <span style={{ userSelect: 'all' }}>{p.wallet}</span>{' '}
                    <button className="btn" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => copy(p)}>{copied === p.id ? 'Copied' : 'Copy'}</button>
                  </td>
                  <td className="h">{sol(p.lamports)} SOL</td>
                  <td><input id={`sig-${p.id}`} placeholder="Paste tx signature" value={sigs[p.id] ?? ''} onChange={(e) => setSigs({ ...sigs, [p.id]: e.target.value })} aria-label="Transaction signature" /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="cta" style={{ padding: '7px 12px' }} onClick={() => post({ id: p.id, action: 'paid', signature: sigs[p.id] ?? '' }, `Round ${p.round_id} marked paid.`)}>Mark paid</button>{' '}
                    <button className="btn" onClick={() => post({ id: p.id, action: 'skip' }, `Round ${p.round_id} skipped. Its amount went back into the pool.`)}>Skip</button>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          <p className="hint" style={{ marginTop: 8 }}>Pasting the transaction signature is optional, but it puts a Solscan link on the public winners list.</p>
        </div>
      )}

      {data && done.length > 0 && (
        <div className="card">
          <h2>History</h2>
          <div className="tbl"><table>
            <thead><tr><th>Round</th><th>Winner</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>{done.map((p) => (
              <tr key={p.id}>
                <td>{p.round_id}</td>
                <td className="h">{p.handle || ''} {p.wallet.slice(0, 4)}…{p.wallet.slice(-4)}</td>
                <td className="h">{sol(p.lamports)} SOL</td>
                <td>{p.tx_signature ? <a href={`https://solscan.io/tx/${p.tx_signature}`} target="_blank" rel="noreferrer">Paid ↗</a> : p.status}</td>
                <td><button className="btn" onClick={() => post({ id: p.id, action: 'reopen' }, `Round ${p.round_id} moved back to waiting.`)}>Undo</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
