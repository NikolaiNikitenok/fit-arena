// Картинка «Мой прогресс» 1080×1350 для сторис и мессенджеров.
import { elapsed, savedOf } from './store.js';
import { parts, plural, money, toast } from './util.js';

export async function shareProgress(h) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#12332c');
  bg.addColorStop(1, '#0b1a17');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // Мягкое свечение.
  const glow = g.createRadialGradient(W / 2, 470, 40, W / 2, 470, 560);
  glow.addColorStop(0, 'rgba(95,224,168,.35)');
  glow.addColorStop(1, 'rgba(95,224,168,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  const ms = elapsed(h);
  const p = parts(ms);
  const font = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  g.textAlign = 'center';
  g.fillStyle = 'rgba(238,246,243,.75)';
  g.font = font(700, 44);
  g.fillText('СВОБОДА', W / 2, 140);

  // Кольцо прогресса до следующего «круглого» числа дней.
  const target = [1, 3, 7, 14, 30, 60, 90, 180, 365, 730].find((d) => d > p.d) || p.d + 1;
  const pct = Math.min(1, ms / (target * 864e5));
  g.lineWidth = 34;
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,255,255,.08)';
  g.beginPath(); g.arc(W / 2, 520, 270, 0, Math.PI * 2); g.stroke();
  const ring = g.createLinearGradient(W / 2 - 270, 250, W / 2 + 270, 790);
  ring.addColorStop(0, '#5fe0a8'); ring.addColorStop(1, '#3cc4d6');
  g.strokeStyle = ring;
  g.beginPath(); g.arc(W / 2, 520, 270, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, pct)); g.stroke();

  g.font = font(400, 110);
  g.fillText(h.emoji, W / 2, 440);
  g.fillStyle = '#eef6f3';
  const big = p.d > 0 ? String(p.d) : `${p.h}:${String(p.m).padStart(2, '0')}`;
  g.font = font(900, p.d > 0 ? 180 : 140);
  g.fillText(big, W / 2, 615);
  g.font = font(700, 42);
  g.fillStyle = '#9bb8b0';
  g.fillText(p.d > 0 ? plural(p.d, 'день свободы', 'дня свободы', 'дней свободы') : 'часов свободы', W / 2, 678);

  g.fillStyle = '#eef6f3';
  g.font = font(800, 64);
  g.fillText(`Без привычки: ${h.name.toLowerCase()}`, W / 2, 920, W - 120);

  const facts = [];
  if (h.costPerDay) facts.push(`💰 ${money(savedOf(h))} сэкономлено`);
  if (h.perDay) facts.push(`🚫 ${Math.floor((h.perDay * ms) / 864e5)} ${h.unit || 'раз'} не случилось`);
  if (h.cravings) facts.push(`💪 ${h.cravings} ${plural(h.cravings, 'победа', 'победы', 'побед')} над тягой`);
  g.font = font(600, 46);
  g.fillStyle = '#cfe6df';
  facts.slice(0, 3).forEach((f, i) => g.fillText(f, W / 2, 1020 + i * 70, W - 120));

  g.fillStyle = '#5fe0a8';
  g.font = font(700, 40);
  g.fillText('habit.nikitenok.ru', W / 2, H - 70);

  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'svoboda.png', { type: 'image/png' });
  const text = `${p.d} ${plural(p.d, 'день', 'дня', 'дней')} без привычки «${h.name}» 💪`;
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'svoboda.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Картинка сохранена');
}
