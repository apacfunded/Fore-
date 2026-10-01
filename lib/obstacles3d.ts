// 3D models for the fairway obstacles. Each returns an animate() that runs every
// frame with the clock and the hits happening at this obstacle (seconds since each hit),
// so a sandworm surfaces or a geyser erupts exactly when a ball reaches it.

import type { MapDef, ObstacleType } from './game';

/* eslint-disable @typescript-eslint/no-explicit-any */
type T3 = any;
export type ObstacleHit = { a: number; fail: boolean; z: number };
type Push = (x: number, y: number, z: number, color: number) => void;
export type ObstacleAnim = (now: number, hits: ObstacleHit[], push: Push, reduce: boolean) => void;

export function buildObstacle3D(THREE: T3, group: T3, type: ObstacleType, ox: number, gy: number, m: MapDef): ObstacleAnim {
  const lam = (color: number, extra: object = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const add = (mesh: T3, x: number, y: number, z: number) => { mesh.position.set(x, y, z); group.add(mesh); return mesh; };
  const recent = (hits: ObstacleHit[], from: number, to: number, failOnly = false) =>
    hits.filter((h) => h.a >= from && h.a <= to && (!failOnly || h.fail));

  switch (type) {
    case 'windmill': {
      add(new THREE.Mesh(new THREE.BoxGeometry(70, 80, 90), lam(0xf1e3c6)), ox + 10, gy + 40, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(4, 28, 34), new THREE.MeshBasicMaterial({ color: 0x1b1410 })), ox - 26, gy + 14, 0);
      const roof = add(new THREE.Mesh(new THREE.ConeGeometry(66, 54, 4), lam(0xc0392b)), ox + 10, gy + 107, 0);
      roof.rotation.y = Math.PI / 4;
      const hub = new THREE.Group();
      hub.position.set(ox - 30, gy + 74, 0);
      for (let i = 0; i < 4; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(3, 96, 16), lam(0xfff8ec));
        blade.position.y = 48;
        const arm = new THREE.Group(); arm.rotation.x = (i * Math.PI) / 2; arm.add(blade); hub.add(arm);
      }
      hub.add(new THREE.Mesh(new THREE.SphereGeometry(8, 10, 8), lam(0x7a4b2a)));
      group.add(hub);
      return (now, hits, _push, reduce) => {
        const kick = recent(hits, 0, 0.6, true).length ? 3 : 1;
        hub.rotation.x = reduce ? 0.4 : (now / 520) * kick;
      };
    }
    case 'sprinkler': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 22, 10), lam(0x666a70)), ox, gy + 11, 0);
      const arm = new THREE.Group(); arm.position.set(ox, gy + 24, 0);
      arm.add(new THREE.Mesh(new THREE.BoxGeometry(8, 6, 250), lam(0xd9dde2)));
      for (const z of [-125, 125]) { const n = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 6), lam(0x2f7cc0)); n.position.z = z; arm.add(n); }
      group.add(arm);
      return (now, _hits, push, reduce) => {
        const ang = reduce ? 0 : now / 380;
        arm.rotation.y = ang;
        if (reduce) return;
        for (const end of [-1, 1]) {
          const ex = ox + Math.sin(ang) * 125 * end, ez = Math.cos(ang) * 125 * end;
          for (let k = 0; k < 10; k++) {
            const t = ((now / 900 + k / 10) % 1);
            const dx = Math.cos(ang) * end * 60 * t, dz = -Math.sin(ang) * end * 60 * t;
            push(ex + dx, gy + 24 + 50 * t - 70 * t * t, ez + dz, 0xcfe9ff);
          }
        }
      };
    }
    case 'tumbleweeds': {
      const weeds = [0, 1, 2].map(() => add(new THREE.Mesh(new THREE.IcosahedronGeometry(20, 1), lam(0x9a7a45, { wireframe: true })), ox, gy + 20, 0));
      return (now, hits, _push, reduce) => {
        weeds.forEach((w: T3, i: number) => {
          const t = reduce ? 0 : now / 1000;
          const z = ((t * 70 + i * 140) % 420) - 210;
          w.position.set(ox - 10 + i * 18, gy + 20 + Math.abs(Math.sin(t * 4 + i)) * 14, z);
          w.rotation.x = -z / 20; w.rotation.y = t + i;
        });
        const bump = recent(hits, 0, 0.5, true)[0];
        if (bump) weeds[0].position.z = bump.z;
      };
    }
    case 'sandworm': {
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(34, 6, 8, 24), lam(0x8a6a3a)), ox, gy + 1, 0);
      ring.rotation.x = Math.PI / 2;
      const worm = new THREE.Group(); group.add(worm);
      const segs: T3[] = [];
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(22 - i * 1.8, 12, 10), lam(i % 2 ? 0xb07a5a : 0xc48a66));
        worm.add(s); segs.push(s);
      }
      const mouth = new THREE.Mesh(new THREE.SphereGeometry(12, 10, 8), new THREE.MeshBasicMaterial({ color: 0x2a0d0d }));
      worm.add(mouth);
      return (now, hits, push, reduce) => {
        const eat = recent(hits, -0.5, 1.6, true)[0];
        const idle = reduce ? 0 : Math.max(0, Math.sin(now / 1400)) ** 8 * 0.35; // an occasional peek
        const e = eat ? Math.max(0, Math.sin(Math.min(1, (eat.a + 0.5) / 2.1) * Math.PI)) : idle;
        const z = eat ? eat.z : 0;
        worm.visible = e > 0.02;
        segs.forEach((s: T3, i: number) => {
          const up = i * 17 * e;
          s.position.set(ox - 12 + Math.sin(i * 0.5) * 12 * e - i * 3 * e, gy - 10 + up, z);
        });
        const head = segs[segs.length - 1].position;
        mouth.position.set(head.x - 10, head.y + 4, head.z);
        ring.scale.setScalar(1 + (reduce ? 0 : 0.08 * Math.sin(now / 300)) + e * 0.4);
        if (eat && eat.a > -0.3 && eat.a < 0.6) for (let k = 0; k < 18; k++) push(ox + Math.cos(k) * 40 * (eat.a + 0.3), gy + 30 * (eat.a + 0.3) + (k % 3) * 6, z + Math.sin(k) * 40 * (eat.a + 0.3), 0xd8b878);
      };
    }
    case 'snowman': {
      const man = new THREE.Group(); man.position.set(ox, gy, 0); group.add(man);
      const snow = lam(0xffffff);
      for (const [r, y] of [[30, 30], [22, 78], [16, 112]] as [number, number][]) { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), snow); b.position.y = y; man.add(b); }
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 18, 12), lam(0x1a1a1a)); hat.position.y = 134; man.add(hat);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 3, 14), lam(0x1a1a1a)); brim.position.y = 125; man.add(brim);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(3.5, 18, 8), lam(0xff8a2a)); nose.rotation.z = Math.PI / 2; nose.position.set(-22, 114, 0); man.add(nose);
      for (const z of [-6, 6]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(2.4, 6, 6), lam(0x111111)); eye.position.set(-14, 120, z); man.add(eye); }
      return (_now, hits) => {
        const h = recent(hits, 0, 0.8)[0];
        man.rotation.z = h ? Math.sin(h.a * 28) * 0.18 * (1 - h.a / 0.8) : 0;
      };
    }
    case 'icespikes': {
      const mat = lam(0xbfe8ff, { emissive: 0x1a3a4a, transparent: true, opacity: 0.92 });
      const spikes = Array.from({ length: 9 }, (_, i) => add(new THREE.Mesh(new THREE.ConeGeometry(11, 1, 6), mat), ox, gy, -120 + i * 30));
      const blocks: T3[] = [];
      return (now, hits, _push, reduce) => {
        spikes.forEach((s: T3, i: number) => {
          let h = reduce ? 0.6 : 0.25 + 0.75 * Math.max(0, Math.sin(now / 650 + i * 0.8));
          for (const hit of recent(hits, 0, 99, true)) if (Math.abs(s.position.z - hit.z) < 26) h = 1;
          s.scale.y = 44 * h; s.position.y = gy + 22 * h;
        });
        // An ice block around each frozen ball
        const frozen = recent(hits, 0.2, 99, true);
        while (blocks.length < frozen.length) blocks.push(add(new THREE.Mesh(new THREE.BoxGeometry(22, 22, 22), mat), ox - 6, gy + 11, 0));
        blocks.forEach((b: T3, i: number) => { b.visible = i < frozen.length; if (b.visible) b.position.z = frozen[i].z; });
      };
    }
    case 'geyser': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(34, 40, 10, 16), lam(0x2a2220)), ox, gy + 5, 0);
      const core = new THREE.MeshBasicMaterial({ color: 0xff6a2a });
      const glow = add(new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 2, 16), core), ox, gy + 10.5, 0);
      const flame = add(new THREE.Mesh(new THREE.ConeGeometry(24, 1, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.8 })), ox, gy + 10, 0);
      flame.rotation.x = Math.PI;
      return (now, hits, push, reduce) => {
        const blast = recent(hits, -0.15, 1.2, true)[0];
        const idle = reduce ? 0 : Math.max(0, Math.sin(now / 900)) ** 6;
        const k = blast ? 1 : idle * 0.55;
        flame.visible = k > 0.03;
        flame.scale.set(0.6 + k * 0.6, 20 + k * 300, 0.6 + k * 0.6);
        flame.position.y = gy + 10 + (20 + k * 300) / 2;
        glow.material.color.setHex(k > 0.1 ? 0xffd23f : 0xff6a2a);
        if (k > 0.1 && !reduce) for (let i = 0; i < 26; i++) {
          const t = ((now / 700 + i / 26) % 1);
          push(ox + Math.sin(i * 7.1) * 20 * t, gy + 20 + t * 300 * k, Math.cos(i * 3.3) * 20 * t, i % 3 ? 0xffb03a : 0xff4a1a);
        }
      };
    }
    case 'boulder': {
      const rock = add(new THREE.Mesh(new THREE.DodecahedronGeometry(34, 0), lam(0x4a4440, { flatShading: true })), ox, gy + 34, 0);
      const dust = m.colors.rough;
      return (now, hits, push, reduce) => {
        const t = reduce ? 0 : now / 1000;
        const z = 170 * Math.sin(t * 0.9);
        const hit = recent(hits, 0, 0.4, true)[0];
        rock.position.set(ox, gy + 34, hit ? hit.z : z);
        rock.rotation.x = -z / 34;
        if (!reduce && Math.abs(Math.cos(t * 0.9)) > 0.6) for (let i = 0; i < 6; i++) push(ox + (i - 3) * 6, gy + 3 + (i % 2) * 4, z - Math.sign(Math.cos(t * 0.9)) * 30, parseInt(dust.slice(1), 16));
      };
    }
  }
}
