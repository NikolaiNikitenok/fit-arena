// Огонь на кулаках: частицы пламени у запястий на картинке с камеры, пока идёт комбо (src/game/combo.ts).
// Рисуется на том же холсте, что и скелет, после него; чем выше сила комбо, тем больше и гуще пламя.
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

// Запястья в позе MediaPipe.
const WRISTS = [15, 16];
const MAX_PARTICLES = 220;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
}

export class Flames {
  private ps: Particle[] = [];
  private last = 0;

  /** Кадр: tier — сила комбо (0 — огонь гаснет), lowPower — частиц вдвое меньше. */
  step(ctx: CanvasRenderingContext2D, lm: NormalizedLandmark[] | undefined, tier: number, now: number, lowPower = false): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const s = w / 640;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (tier > 0 && lm) {
      const per = Math.max(1, Math.round((tier * 3) / (lowPower ? 2 : 1)));
      for (const i of WRISTS) {
        const p = lm[i];
        if (!p || (p.visibility ?? 1) < 0.5) continue;
        for (let k = 0; k < per && this.ps.length < MAX_PARTICLES; k++) {
          const max = 0.35 + Math.random() * 0.35;
          this.ps.push({
            x: p.x * w + (Math.random() - 0.5) * 30 * s,
            y: p.y * h + (Math.random() - 0.5) * 30 * s,
            vx: (Math.random() - 0.5) * 80 * s,
            vy: -(110 + Math.random() * 130 + tier * 40) * s,
            life: max,
            max,
            // Картинка с камеры на экране маленькая: пламя крупное, чтобы было видно.
            r: (20 + tier * 10 + Math.random() * 10) * s,
          });
        }
      }
    }
    this.ps = this.ps.filter((p) => (p.life -= dt) > 0);
    if (!this.ps.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.ps) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const t = p.life / p.max;
      const r = p.r * (0.45 + 0.55 * t);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(255, 244, 200, ${0.9 * t})`);
      g.addColorStop(0.35, `rgba(255, 170, 60, ${0.7 * t})`);
      g.addColorStop(1, 'rgba(255, 60, 20, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  clear(): void {
    this.ps = [];
    this.last = 0;
  }
}
