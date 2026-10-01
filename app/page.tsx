'use client';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GolfCourse, { Playback } from '@/components/GolfCourse';
import ArcadeCanvas from '@/components/ArcadeCanvas';
import { buildRound, describeShot, shotRank, playByPlay, MAPS } from '@/lib/game';
import { gameImpl, isGolf, Built } from '@/lib/games';
import { metaFor } from '@/lib/games/rotation';
import { createSound } from '@/lib/sound';
import { ADDRESS_RE, CALLOUT_RE, HANDLE_RE } from '@/lib/entry';

type Player = { handle: string; wallet: string };
type State = {
  now: number;
  round: { id: number; game?: string; endsAt: number; players: Player[] };
  rotation?: string[];
  poolLamports: number;
  poolInfo: { solUsd: number | null; volumeH24Usd: number | null; feePct: number; unlocked: boolean; minLamports: number };
  payoutShare: number;
  maxPayoutLamports: number;
  roundMs: number;
  tiers: { minSol: number; seconds: number }[];
  lastRound: null | { id: number; game?: string; seed: number; blockhash: string | null; settledAt: string | null; payoutLamports: number; practice: boolean; players: Player[] };
  winners: { round: number; handle: string; wallet: string; lamports: number; status: string; tx: string | null }[];
  tokenMint?: string;
};

const SYMBOL = process.env.NEXT_PUBLIC_TOKEN_SYMBOL || 'CALLED';
const sol = (l: number) => (l / 1e9).toFixed(3);
const dur = (ms: number) => { const s = Math.round(ms / 1000); return s < 60 ? `${s} sec` : s % 60 === 0 ? `${s / 60} min` : `${Math.floor(s / 60)}m ${s % 60}s`; };
const usd = (n: number) => '$' + (n >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(2));
const ADDR_KEY = 'cob-address';

export default function Home() {
  const [me, setMe] = useState<string | undefined>();
  useEffect(() => { try { setMe(localStorage.getItem(ADDR_KEY) || undefined); } catch {} }, []);
  const [state, setState] = useState<State | null>(null);
  const [offset, setOffset] = useState(0);
  const offsets = useRef<number[]>([]);
  const [netErr, setNetErr] = useState('');
  const [playback, setPlayback] = useState<(Playback & { game: string; built: Built | null; wallets: string[]; winnerEnd: number; total: number; payout: number; practice: boolean }) | null>(null);
  const sound = useMemo(() => createSound(), []);
  const [soundOn, setSoundOn] = useState(false);
  const seenRound = useRef<number | null>(null);
  const [, force] = useState(0);

  // Poll the game server.
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Server error');
      setState(d);
      // Cached responses can only look older than they are, so the largest recent offset is the truest.
      offsets.current = [...offsets.current.slice(-9), d.now - Date.now()];
      setOffset(Math.max(...offsets.current));
      setNetErr('');
      const lr = d.lastRound as State['lastRound'];
      if (lr) {
        const fresh = lr.settledAt && Date.now() + (d.now - Date.now()) - new Date(lr.settledAt).getTime() < 15000;
        if (seenRound.current !== null && seenRound.current !== lr.id && fresh) {
          const base = { roundId: lr.id, players: lr.players.map((p) => p.handle), wallets: lr.players.map((p) => p.wallet), startedAt: Date.now(), payout: lr.payoutLamports, practice: lr.practice };
          if (isGolf(lr.game)) {
            const built = buildRound(lr.seed, lr.players.length);
            setPlayback({ ...base, game: 'golf', built: null, map: built.map, shots: built.shots, winner: built.winner, winnerEnd: built.winnerEnd, total: built.total });
          } else {
            const built = gameImpl(lr.game!).build(lr.seed, lr.players.length);
            setPlayback({ ...base, game: lr.game!, built, map: 0, shots: [], winner: built.winner, winnerEnd: built.winnerEnd, total: built.total });
          }
        }
        seenRound.current = lr.id;
      } else if (seenRound.current === null) {
        seenRound.current = -1;
      }
    } catch {
      setNetErr('Lost connection to the game. Retrying…');
    }
  }, []);

  useEffect(() => {
    load();
    const a = setInterval(load, 2000);
    const b = setInterval(() => force((n) => n + 1), 250);
    return () => { clearInterval(a); clearInterval(b); };
  }, [load]);

  const serverNow = Date.now() + offset;
  const el = playback ? (Date.now() - playback.startedAt) / 1000 : 0;
  const playing = !!playback && el < playback.total;
  const showWinner = !!playback && el >= playback.winnerEnd && el < playback.total;

  const msLeft = state ? Math.max(0, state.round.endsAt - serverNow) : 60000;
  const clock = `${Math.floor(Math.ceil(msLeft / 1000) / 60)}:${String(Math.ceil(msLeft / 1000) % 60).padStart(2, '0')}`;
  const roundMs = state?.roundMs ?? 60000;
  const players = state?.round.players ?? [];
  const locked = !!state && !state.poolInfo.unlocked;
  const nextWin = state ? Math.min(state.poolLamports * state.payoutShare, state.maxPayoutLamports) : 0;
  const fillPct = state ? Math.min(100, (state.poolLamports / state.poolInfo.minLamports) * 100) : 0;

  // Last round's results table (hidden until its playback finishes, so the result isn't spoiled).
  const results = useMemo(() => {
    const lr = state?.lastRound;
    if (!lr) return null;
    if (!isGolf(lr.game)) {
      // Arcade round: one result line per player, best first.
      const b = gameImpl(lr.game!).build(lr.seed, lr.players.length);
      const rows = b.results.map((r) => ({ win: r.index === b.winner, p: lr.players[r.index], text: r.text + (r.by != null && lr.players[r.by] ? ` by ${lr.players[r.by].handle}` : ''), score: r.score, index: r.index }))
        .sort((a, c) => (a.win ? -1 : c.win ? 1 : c.score - a.score || a.index - c.index));
      return { lr, game: lr.game!, rows, winner: lr.players[b.winner], shots: null, map: 0 };
    }
    const built = buildRound(lr.seed, lr.players.length);
    const m = MAPS[built.map];
    const rows = built.shots
      .map((s) => ({ s, p: lr.players[s.index] }))
      .sort((a, b) => shotRank(a.s) - shotRank(b.s))
      .map(({ s, p }) => ({ win: s.kind === 'hole', p, text: describeShot(m, s), score: 0, index: s.index }));
    return { lr, game: 'golf', rows, winner: lr.players[built.winner], shots: built.shots, map: built.map };
  }, [state?.lastRound]);
  const hideResults = playing && playback?.roundId === results?.lr.id && !showWinner;
  // Course on screen: the round being played, or the last one between rounds.
  const courseMap = playing && playback ? playback.map : results?.map ?? 0;
  const youNow = playing && playback && me ? playback.wallets.indexOf(me) : -1;
  const youLast = results && me ? results.lr.players.findIndex((p) => p.wallet === me) : -1;
  const lines = useMemo(() => (playback && playback.game === 'golf' ? playByPlay(MAPS[playback.map], playback, playback.players) : []), [playback]);
  // Which game is on screen: the one playing now, otherwise the next round's game.
  const nextKey = state?.round.game ?? 'golf';
  const shownKey = playing && playback ? playback.game : nextKey;
  const shown = metaFor(shownKey);
  const upNext = metaFor(nextKey);
  const golfOnScreen = shownKey === 'golf';
  const nouns = (n: number) => `${n} ${n === 1 ? upNext.noun : upNext.noun + 's'}`;
  const gameOfRound = (id: number) => { const r = state?.rotation; return r && r.length ? metaFor(r[(((id - 1) % r.length) + r.length) % r.length]) : null; };
  const ticker = playing ? lines.filter((l) => l.t <= el).slice(-4) : [];
  const view = useRef({ playback: null as Playback | null, teeCount: 0, map: 0 });
  view.current = { playback: playing && playback?.game === 'golf' ? playback : null, teeCount: players.length, map: courseMap };

  // Sounds follow the same clock as the picture.
  useEffect(() => {
    let id = 0;
    const loop = () => { sound.tick(view.current); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [sound]);

  // Countdown in the browser tab, so people with the tab in the background know when to look.
  useEffect(() => {
    document.title = playing ? `🕹️ Round ${playback?.roundId} live · Called It` : state && ADDRESS_RE.test(state.tokenMint ?? '') ? `${clock} · ${upNext.name} · Called It` : 'Called It';
  }, [playing, playback?.roundId, clock, state, upNext.name]);

  let overlay: { big: string; who: string; sub: string; idle: boolean } | null = null;
  // The game stays closed until the coin's CA is set.
  const live = !!state?.tokenMint && ADDRESS_RE.test(state.tokenMint);
  // Until the coin launches (TOKEN_MINT=pending), point to pump.fun itself.
  const pumpUrl = state?.tokenMint && ADDRESS_RE.test(state.tokenMint) ? `https://pump.fun/coin/${state.tokenMint}` : 'https://pump.fun';
  const minSol = state ? sol(state.poolInfo.minLamports) : '5';
  if (showWinner && playback) overlay = playback.practice
    ? { big: metaFor(playback.game).win, who: playback.players[playback.winner], sub: `Practice round · payouts start when the pool hits ${minSol} SOL`, idle: false }
    : { big: metaFor(playback.game).win, who: playback.players[playback.winner], sub: `Called it · +${sol(playback.payout)} SOL from the pool`, idle: false };
  else if (state && !live) overlay = { big: 'OPENING SOON', who: '🕹️', sub: `Rounds start when $${SYMBOL} launches`, idle: true };
  else if (!playing) {
    overlay = msLeft > 0
      ? { big: locked ? `PRACTICE · ${upNext.name.toUpperCase()}` : `NEXT UP · ${upNext.name.toUpperCase()}`, who: clock, sub: locked ? `No payouts until the pool hits ${minSol} SOL` : players.length ? `${nouns(players.length)} in` : 'Waiting for callouts', idle: true }
      : { big: upNext.name.toUpperCase(), who: '…', sub: players.length ? 'Drawing the winner' : 'No callouts, pool rolls over', idle: true };
  }

  const myWin = (w: State['winners'][number]) => w.wallet === me;
  const shareText = (amt: string) => `called it 🕹️ just won ${amt} SOL on the Called It arcade. make a callout on pump.fun for a shot at the pot: foregolf.lol $${SYMBOL}`;

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1><img className="logo" src="/called-logo.png" alt="" width={64} height={64} />CALLED IT<span>!</span></h1>
          <p className="tag">The callout arcade. Call out ${SYMBOL} on pump.fun to get in. Every round is a different 3D game, everyone in plays together, and one winner takes {Math.round((state?.payoutShare ?? 0.1) * 100)}% of the pool, up to {state ? parseFloat(sol(state.maxPayoutLamports)) : 0.5} SOL. The bigger the pool, the faster rounds come.</p>
        </div>
        <div className="toplinks">
          <CopyCA mint={state?.tokenMint && ADDRESS_RE.test(state.tokenMint) ? state.tokenMint : null} />
          <a className="pumplink" href={pumpUrl} target="_blank" rel="noreferrer">${SYMBOL} on pump.fun ↗</a>
        </div>
      </header>

      <div className="grid">
        <div className="main">
          <div className="course">
            {golfOnScreen
              ? <GolfCourse playback={playing && playback?.game === 'golf' ? playback : null} teeCount={players.length} map={courseMap} resting={results?.game === 'golf' ? results.shots : null} you={playing ? youNow : youLast} />
              : <ArcadeCanvas playback={playing && playback && playback.built ? { roundId: playback.roundId, game: playback.game, built: playback.built, players: playback.players, startedAt: playback.startedAt } : null} idleGame={shownKey} waiting={players.length} label={`${shown.name}: ${shown.hud}`} />}
            <div className="hud">
              <span>Round #{playing && playback ? playback.roundId : state?.round.id ?? '–'}</span>
              <span>{shown.name} · {golfOnScreen ? `${MAPS[courseMap].name} · ${shown.hud}` : shown.hud}</span>
              {!playing && <span>{nouns(players.length)}</span>}
            </div>
            {golfOnScreen && (
              <button type="button" className="soundbtn" aria-pressed={soundOn} onClick={() => { sound.setEnabled(!soundOn); setSoundOn(!soundOn); }}>
                {soundOn ? '🔊 Sound on' : '🔇 Sound off'}
              </button>
            )}
            {overlay && !overlay.idle && (
              <div className="overlay"><div className="box"><div className="big">{overlay.big}</div><div className="who">{overlay.who}</div><div className="sub">{overlay.sub}</div></div></div>
            )}
            {overlay && overlay.idle && (
              <div className="banner"><b>{overlay.big}</b><span className="t">{overlay.who}</span><span className="sub">{overlay.sub}</span></div>
            )}
            {ticker.length > 0 && (
              <ul className="ticker" aria-live="polite">
                {ticker.map((l) => <li key={l.t + l.text} className={`${l.tone}${l.who === youNow ? ' mine' : ''}`}>{l.text}</li>)}
              </ul>
            )}
          </div>

          {state?.rotation && (
            <div className="strip" aria-label="Game rotation">
              {state.rotation.map((k) => {
                const m = metaFor(k);
                const now = playing && k === shownKey;
                const next = !playing && k === nextKey;
                return <span key={k} className={now ? 'now' : next ? 'next' : ''}>{m.name}{now ? ' · playing' : next ? ' · up next' : ''}</span>;
              })}
            </div>
          )}

          <div className="lower">
            <div className="card">
              <h2>Last round{results && !hideResults ? ` · ${metaFor(results.game).name}` : ''}{results?.lr.practice && !hideResults ? ' · practice' : ''}{results && !hideResults && results.game === 'golf' ? ` · ${MAPS[results.map].name}` : ''}</h2>
              {!results ? <p className="empty">Results show here after the first game.</p>
                : hideResults ? <p className="empty">Round {results.lr.id} is playing…</p>
                : (
                  <>
                    <div className="tbl"><table><tbody>
                      {results.rows.map(({ win, p, text }) => (
                        <tr key={p.wallet} className={`${win ? 'win' : ''}${p.wallet === me ? ' mine' : ''}`}>
                          <td className="h">{p.handle}{p.wallet === me ? ' (you)' : ''}</td>
                          <td className="r">{text}{win ? (results.lr.practice ? ' · practice, no payout' : ` · +${sol(results.lr.payoutLamports)} SOL`) : ''}</td>
                        </tr>
                      ))}
                    </tbody></table></div>
                    <p className="seed">
                      Round {results.lr.id} · seed = first 8 hex of sha256(&quot;{results.lr.blockhash}:{results.lr.id}&quot;) = {results.lr.seed} · {results.lr.seed} mod {results.lr.players.length} = {results.lr.seed % results.lr.players.length} → {results.winner.handle}
                    </p>
                  </>
                )}
            </div>
            <div className="card">
              <h2>Winners</h2>
              {state?.winners.length ? (
                <ul className="feed">
                  {state.winners.filter((w) => !(playing && playback?.roundId === w.round && !showWinner)).map((w) => (
                    <li key={w.round} className={myWin(w) ? 'mine' : ''}>
                      <span><span className="h">{w.handle}{myWin(w) ? ' (you)' : ''}</span> <span style={{ color: 'var(--ink-soft)' }}>· {gameOfRound(w.round)?.name ?? 'round'} #{w.round}</span></span>
                      <span className="right">
                        {myWin(w) && w.status !== 'skipped' && (
                          <a className="share" href={`https://x.com/intent/post?text=${encodeURIComponent(shareText(sol(w.lamports)))}`} target="_blank" rel="noreferrer">Share on X</a>
                        )}
                        {w.status === 'paid' && w.tx
                          ? <a className="amt" href={`https://solscan.io/tx/${w.tx}`} target="_blank" rel="noreferrer">+{sol(w.lamports)} SOL ↗</a>
                          : w.status === 'skipped' ? <span className="amt pending">not paid</span>
                          : <span className="amt pending">+{sol(w.lamports)} SOL · {w.status === 'paid' ? 'paid' : 'sending'}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="empty">No winners yet.</p>}
            </div>
          </div>
        </div>

        <aside className="rail">
          <div className="card">
            <p className="label">Prize pool</p>
            <div className="pool">{state ? sol(state.poolLamports) : '–'} <small>SOL</small></div>
            {locked && state ? (<>
              <p className="payout">Payouts start at <b>{sol(state.poolInfo.minLamports)} SOL</b></p>
              <div className="bar" aria-label={`Pool is ${Math.floor(fillPct)}% full`}><i style={{ width: `${fillPct}%`, background: 'var(--good)' }} /></div>
              <p className="hint" style={{ marginTop: 6 }}>{Math.floor(fillPct)}% full · {sol(Math.max(0, state.poolInfo.minLamports - state.poolLamports))} SOL to go. Until then, rounds are practice: you can play and win, but nobody gets paid.</p>
            </>) : <p className="payout">Next winner gets <b>{state ? sol(nextWin) : '–'} SOL</b></p>}
            {state?.poolInfo.volumeH24Usd != null && (
              <p className="hint" style={{ marginTop: 6 }}>
                Estimated from ${SYMBOL} trading: {usd(state.poolInfo.volumeH24Usd)} volume in 24h × {state.poolInfo.feePct}% creator fee
                {state.poolInfo.solUsd ? ` · 1 SOL ≈ ${usd(state.poolInfo.solUsd)}` : ''}
              </p>
            )}
            {netErr && <p className="msg err">{netErr}</p>}
          </div>

          <div className="card clock">
            <p className="label">{playing ? `Playing ${shown.name}` : state && !live ? 'First round' : `${locked ? 'Practice ' : ''}${upNext.name} starts in`}</p>
            <div className="t">{playing ? `${Math.floor(el)}s` : state && !live ? 'At launch' : clock}</div>
            <div className="bar"><i style={{ width: `${playing ? 100 : Math.max(0, 100 - (msLeft / roundMs) * 100)}%` }} /></div>
            {state && (locked
              ? <p className="hint" style={{ marginTop: 8 }}>Practice rounds every {dur(roundMs)}.</p>
              : <>
                  <p className="hint" style={{ marginTop: 8 }}>Bigger pool, faster rounds. Right now: a round every <b>{dur(roundMs)}</b>.</p>
                  <table style={{ marginTop: 6, fontSize: 12.5 }}><tbody>
                    {state.tiers.map((t, i) => {
                      const next = state.tiers[i + 1];
                      const on = state.poolLamports / 1e9 >= t.minSol && (!next || state.poolLamports / 1e9 < next.minSol);
                      return (
                        <tr key={t.minSol} className={on ? 'win' : ''}>
                          <td>{next ? `${t.minSol}–${next.minSol} SOL` : `${t.minSol}+ SOL`}</td>
                          <td className="r">every {dur(t.seconds * 1000)}</td>
                        </tr>
                      );
                    })}
                  </tbody></table>
                </>)}
          </div>

          <EntryCard
            roundId={state?.round.id ?? null}
            onEntered={(addr) => { setMe(addr); try { localStorage.setItem(ADDR_KEY, addr); } catch {} load(); }}
            savedAddress={me}
            alreadyIn={!!me && players.some((p) => p.wallet === me)}
            practiceUntil={locked ? minSol : null}
            gameName={upNext.name}
            pumpUrl={pumpUrl}
            closed={!!state && !live}
          />

          <div className="card">
            <p className="label">In the next game · {players.length}</p>
            {players.length ? (
              <ul className="queue">{players.map((p) => <li key={p.wallet} className={p.wallet === me ? 'you' : ''}>{p.handle}</li>)}</ul>
            ) : <p className="empty">No callouts yet. If nobody enters, the pool rolls over.</p>}
          </div>
        </aside>
      </div>

      <p className="how">
        <b>How to play:</b> post a callout for ${SYMBOL} on pump.fun, paste the link, and add the Solana address you want to be paid to. One entry per person per round, and each callout link works once. Rounds take turns through {state?.rotation?.length ?? 10} games.
        {' '}<b>How the winner is picked:</b> when a round ends, the server takes the latest finalized Solana blockhash, hashes it with the round number, and uses that as the seed. Seed mod the number of entries picks the winner in every game, and every visitor&apos;s screen plays out the same round from the same seed.
        {' '}<b>The pool</b> is an estimate of creator rewards from the coin&apos;s trading volume on DexScreener. Winnings are sent by hand, usually soon after the round.
      </p>
    </div>
  );
}

// The coin's contract address with a copy button, or "launching soon" before launch.
function CopyCA({ mint }: { mint: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!mint) return <div className="ca"><span className="k">CA</span><span className="v">launching soon</span></div>;
  const copy = async () => {
    try { await navigator.clipboard.writeText(mint); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { window.prompt('Copy the contract address:', mint); }
  };
  return (
    <button type="button" className="ca" onClick={copy} title={mint} aria-label={`Copy contract address ${mint}`}>
      <span className="k">CA</span><span className="v">{mint.slice(0, 6)}…{mint.slice(-6)}</span><span className="c">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

function EntryCard({ roundId, onEntered, savedAddress, alreadyIn, practiceUntil, pumpUrl, closed, gameName }: {
  roundId: number | null; onEntered: (address: string) => void; savedAddress?: string; alreadyIn: boolean; practiceUntil: string | null; pumpUrl: string; closed: boolean; gameName: string;
}) {
  const [handle, setHandle] = useState('');
  const [link, setLink] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (savedAddress && !address) setAddress(savedAddress); }, [savedAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const url = link.trim();
    const addr = address.trim();
    if (roundId == null) return setMsg({ ok: false, text: 'The game is still loading. Try again in a second.' });
    if (!CALLOUT_RE.test(url)) return setMsg({ ok: false, text: 'Paste the link to your callout on pump.fun.' });
    if (!ADDRESS_RE.test(addr)) return setMsg({ ok: false, text: 'Enter the Solana address you want to be paid to.' });
    if (handle && !HANDLE_RE.test(handle)) return setMsg({ ok: false, text: 'Names use letters, numbers and underscores, up to 20.' });
    setBusy(true);
    try {
      const r = await fetch('/api/enter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: addr, handle: handle.trim(), calloutUrl: url, roundId }),
      });
      const d = await r.json();
      if (!r.ok) setMsg({ ok: false, text: d.error || 'Could not enter.' });
      else { setMsg({ ok: true, text: `You're in round ${d.roundId} (${gameName}).` }); setLink(''); onEntered(addr); }
    } catch {
      setMsg({ ok: false, text: 'Could not reach the game. Try again.' });
    } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <p className="label">Get in the next game</p>
      <ol className="steps">
        <li><a href={pumpUrl} target="_blank" rel="noreferrer">Post a callout for ${SYMBOL} on pump.fun ↗</a></li>
        <li>Paste the link to your post below</li>
      </ol>
      <form className="enter" onSubmit={submit} noValidate>
        <input id="link" placeholder="pump.fun link to your callout" value={link} onChange={(e) => setLink(e.target.value)} autoComplete="off" aria-label="pump.fun callout link" />
        <input id="address" placeholder="Solana address to get paid" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Solana payout address" />
        <input id="handle" placeholder="Your name in the game (optional)" value={handle} onChange={(e) => setHandle(e.target.value)} autoComplete="off" aria-label="Your name in the game" />
        <button className="cta" type="submit" disabled={busy || alreadyIn || closed}>
          {closed ? `Opens when $${SYMBOL} launches` : alreadyIn ? "You're in this round" : busy ? 'Entering…' : practiceUntil ? `Enter practice ${gameName}` : `Enter ${gameName}`}
        </button>
        <p className={`msg ${msg ? (msg.ok ? 'ok' : 'err') : ''}`} role="status">{msg?.text}</p>
        {practiceUntil && <p className="hint" style={{ color: 'var(--flag)', fontWeight: 600 }}>Practice round: winners won&apos;t be paid until the pool reaches {practiceUntil} SOL.</p>}
        <p className="hint">Double-check the address. Winnings go exactly where you tell us.</p>
      </form>
    </div>
  );
}
