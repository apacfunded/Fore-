'use client';
import { useEffect, useRef } from 'react';
import { createCourse } from '@/lib/course';
import type { CoursePlayback, CourseView, Shot } from '@/lib/game';

export type Playback = CoursePlayback;

type Props = { playback: Playback | null; teeCount: number; map: number; resting?: Shot[] | null; you?: number | null };
type Course = { update: (v: CourseView) => void; destroy: () => void };

// Renders the hole in 3D (three.js). Falls back to the 2D side view if WebGL isn't available.
export default function GolfCourse({ playback, teeCount, map, resting, you }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const course = useRef<Course | null>(null);
  const latest = useRef<CourseView>({ playback, teeCount, map, resting, you });
  latest.current = { playback, teeCount, map, resting, you };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let c: Course;
      try {
        const [THREE, { createCourse3D }] = await Promise.all([import('three'), import('@/lib/course3d')]);
        if (cancelled) return;
        c = createCourse3D(ref.current!, THREE);
      } catch (e) {
        console.warn('3D view unavailable, using 2D', e);
        if (cancelled) return;
        c = createCourse(ref.current!);
      }
      course.current = c;
      c.update(latest.current);
    })();
    return () => { cancelled = true; course.current?.destroy(); };
  }, []);

  useEffect(() => {
    course.current?.update({ playback, teeCount, map, resting, you });
  }, [playback, teeCount, map, resting, you]);

  return <canvas ref={ref} width={1000} height={480} aria-label="3D golf hole with a camera following every ball toward the pin" />;
}
