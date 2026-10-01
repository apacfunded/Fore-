'use client';
import { useEffect, useRef } from 'react';
import { gameImpl, Built } from '@/lib/games';
import { W, H } from '@/lib/games/util';

export type Playback = {
  roundId: number;
  game: string;
  built: Built;
  players: string[];
  startedAt: number; // Date.now() when playback began
};

type Props = { playback: Playback | null; idleGame: string; waiting: number; label?: string };

export default function ArcadeCanvas({ playback, idleGame, waiting, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ playback, idleGame, waiting });
  live.current = { playback, idleGame, waiting };

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let fx = { roundId: -1, confetti: [] as { x: number; y: number; vx: number; vy: number; c: string }[], fired: false };
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const w = cv.clientWidth || W;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(((w * H) / W) * dpr);
      ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const { playback: pb, idleGame: ig, waiting: wt } = live.current;
      ctx.save();
      try {
        if (!pb) gameImpl(ig).draw(ctx, now / 1000, null, [], wt);
        else {
          if (fx.roundId !== pb.roundId) fx = { roundId: pb.roundId, confetti: [], fired: false };
          const t = (Date.now() - pb.startedAt) / 1000;
          gameImpl(pb.game).draw(ctx, t, pb.built, pb.players, wt);
          if (t >= pb.built.winnerEnd && !fx.fired) {
            fx.fired = true;
            const cols = ['#F2C230', '#E0412B', '#fff', '#86D17A', '#2F80ED'];
            for (let i = 0; i < 120; i++) fx.confetti.push({ x: Math.random() * W, y: -10 - Math.random() * 120, vx: (Math.random() - 0.5) * 120, vy: 40 + Math.random() * 120, c: cols[i % cols.length] });
          }
          if (!reduce) for (const c of fx.confetti) {
            c.vy += 160 * dt; c.x += c.vx * dt; c.y += c.vy * dt;
            if (c.y < H) { ctx.fillStyle = c.c; ctx.fillRect(c.x, c.y, 4, 6); }
          }
        }
      } catch (e) { console.error(e); }
      ctx.restore();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={ref} width={W} height={H} aria-label={label ?? 'Arcade game'} />;
}
