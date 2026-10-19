import { Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { raidBoss } from '../../shared/raid';
import { BOT_USERNAME, share, tg, userName } from '../telegram';
import { Actor } from '../three/Actor';
import { Character, CharacterProps } from '../three/Character';
import { CharName } from '../three/kit';
import { itemById } from './items';
import { LANDS, WORLD_NAMES } from './lands';
import { LevelDef } from './levels';
import { heroHands } from './power';
import { heroLevel, heroTitle, heroXp, Progress, streak } from './progress';
import './ShareCard.css';

// Открытка «Я победил босса»: герой в победной позе рядом с поверженным боссом, статистика и ссылка на бота.
// 3D-сцену рисуем на невидимом холсте, потом поверх неё на 2D-холсте — фон, надписи и приглашение.

export const CARD_W = 1080;
export const CARD_H = 1350;
export const BOT_LINK = `https://t.me/${BOT_USERNAME}`;
const INVITE = 'Сможешь так же? Тренируйся со мной в Telegram';
const FONT = 'Nunito, system-ui, -apple-system, sans-serif';

export interface CardStat {
  label: string;
  value: string;
  // Вместо числа — звёзды (из трёх).
  stars?: number;
}

export interface CardData {
  boss: { name: string; model: CharName | 'robot'; tint?: string; color: string; glow?: string; face: string };
  hero: Pick<CharacterProps, 'model' | 'tint' | 'glow' | 'hands'>;
  // Мир для неба и света: 0 — королевство, 1 — космос, 2 — город, 3 — замок, 4 — рейд клана.
  world: number;
  place: string;
  heroLine: string;
  stats: CardStat[];
  accent: string;
}

// Портрет босса для запасной открытки без WebGL (как в story.ts).
const bossFace = (land: number): string => {
  const L = LANDS[land];
  if (L.world === 'castle') return 'knyaz';
  if (L.world === 'space') return 'boss-1';
  return `boss-${L.world === 'zombie' ? 2 : 0}${land % 3 === 2 ? 'm' : ''}`;
};

const plural = (n: number, one: string, few: string, many: string) => {
  const d = n % 10;
  const h = n % 100;
  return d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
};

function heroBits(p: Progress) {
  const item = itemById(p.equipped);
  const level = heroLevel(heroXp(p)).level;
  const days = streak(p.days, Date.now()).days;
  const name = userName();
  return {
    hero: { model: item.hero, tint: item.tint, glow: item.glow, hands: heroHands(p) },
    level,
    days,
    heroLine: `${name === 'Гость' ? 'Герой' : name} · ${heroTitle(level)}`,
  };
}

const streakStat = (days: number): CardStat => ({ label: 'Серия', value: `${days} ${plural(days, 'день', 'дня', 'дней')}` });

/** Открытка после босса миссии (и финального Князя Дивана). */
export function bossCard(level: LevelDef, p: Progress, reps: number, stars: number): CardData {
  const land = LANDS[level.land];
  const world = level.world;
  const b = heroBits(p);
  // Те же модели, что в сцене боя (MissionScene3D).
  const model: CharName | 'robot' = world === 1 ? 'robot' : level.land % 3 === 2 ? 'Skeleton_Mage' : 'Skeleton_Warrior';
  return {
    boss: { name: land.boss.name, model, tint: world === 2 ? 'mul:0.75,1.15,0.6' : land.boss.color, color: land.boss.color, glow: land.boss.color, face: bossFace(level.land) },
    hero: b.hero,
    world,
    place: world === 3 ? 'Финал · Замок Князя' : `${WORLD_NAMES[land.world]} · ${land.name}`,
    heroLine: b.heroLine,
    stats: [{ label: 'Повторов', value: String(reps) }, { label: 'Звёзды', value: '', stars }, { label: 'Уровень', value: String(b.level) }, streakStat(b.days)],
    accent: land.accent,
  };
}

/** Открытка после победы клана над боссом рейда. */
export function raidCard(raidKey: string, p: Progress, reps: number, dealt: number): CardData {
  const boss = raidBoss(raidKey);
  const b = heroBits(p);
  return {
    boss: {
      name: boss.name,
      model: boss.model,
      tint: boss.tint,
      color: boss.glow,
      glow: boss.glow,
      face: boss.model === 'Skeleton_Mage' ? 'boss-0m' : boss.model === 'Skeleton_Minion' ? 'boss-2' : 'boss-0',
    },
    hero: b.hero,
    world: 4,
    place: 'Рейд клана',
    heroLine: b.heroLine,
    stats: [{ label: 'Повторов', value: String(reps) }, { label: 'Урон', value: dealt.toLocaleString('ru') }, { label: 'Уровень', value: String(b.level) }, streakStat(b.days)],
    accent: boss.glow,
  };
}

// Цвета фона открытки по мирам: верх, середина, низ.
const BG: Record<number, [string, string, string]> = {
  0: ['#2f6fd6', '#7fb6f0', '#1b2a1f'],
  1: ['#05030f', '#2a2050', '#0a0814'],
  2: ['#1e2a24', '#58664f', '#101410'],
  3: ['#1a0b26', '#5b2f6a', '#120818'],
  4: ['#120c22', '#3b2a5c', '#0d0a16'],
};

/* ---------- 3D-сцена ---------- */

const hasWebGL = () => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
};

// Сколько ждать после загрузки моделей: поверженный босс успевает упасть, герой — вскинуть руки.
const POSE_MS = 1750;

function Shot({ onShot }: { onShot: (c: HTMLCanvasElement) => void }) {
  const { gl, scene, camera } = useThree();
  const started = useRef(0);
  const done = useRef(false);
  useFrame(() => {
    const now = performance.now();
    started.current ||= now;
    if (done.current || now - started.current < POSE_MS) return;
    done.current = true;
    gl.render(scene, camera);
    const copy = document.createElement('canvas');
    copy.width = gl.domElement.width;
    copy.height = gl.domElement.height;
    copy.getContext('2d')!.drawImage(gl.domElement, 0, 0);
    onShot(copy);
  });
  return null;
}

function CardStage({ data, onShot }: { data: CardData; onShot: (c: HTMLCanvasElement) => void }) {
  const { boss, hero } = data;
  const glow = boss.glow ?? boss.color;
  const ground = data.world === 1 ? '#2c3644' : data.world === 2 ? '#3a3a3f' : data.world === 0 ? '#8d8478' : '#3d2f4a';
  return (
    <>
      <hemisphereLight args={['#ffffff', '#4a4038', 1.25]} />
      <directionalLight
        position={[3, 7, 5]}
        intensity={2.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-bias={-0.0005}
      />
      {/* Контровой свет в цвет босса и тёплый — на героя. */}
      <pointLight position={[1.6, 2.2, -2.6]} intensity={22} distance={9} color={glow} />
      <pointLight position={[-2.4, 2.4, 2.6]} intensity={10} distance={8} color="#ffd9a8" />
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <cylinderGeometry args={[3.1, 3.3, 0.12, 10]} />
        <meshStandardMaterial color={ground} flatShading roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[2.75, 2.95, 48]} />
        <meshBasicMaterial color={glow} transparent opacity={0.75} />
      </mesh>
      <Suspense fallback={null}>
        {boss.model === 'robot' ? (
          <Actor color={boss.color} glow={glow} anim="Death" speed={2.4} scale={1.5} position={[0.9, 0, -1.3]} rotation={-0.6} />
        ) : (
          <Character model={boss.model} tint={boss.tint} glow={glow} anim="dead" scale={1.35} position={[0.7, 0, -1.4]} rotation={-0.45} />
        )}
        <Character {...hero} anim="cheer" scale={0.9} position={[-0.6, 0, 0.8]} rotation={0.3} />
        <Shot onShot={onShot} />
      </Suspense>
    </>
  );
}

/** Нарисовать 3D-сцену открытки на невидимом холсте и вернуть кадр (с прозрачным фоном). */
export function renderCardScene(data: CardData): Promise<HTMLCanvasElement> {
  if (!hasWebGL()) return Promise.reject(new Error('нет WebGL'));
  return new Promise((resolve, reject) => {
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-${CARD_W * 3}px;top:0;width:${CARD_W}px;height:${CARD_H}px;pointer-events:none;`;
    document.body.appendChild(host);
    const root = createRoot(host);
    let finished = false;
    const finish = (fn: () => void) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      fn();
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };
    const timer = setTimeout(() => finish(() => reject(new Error('сцена не загрузилась'))), 20000);
    root.render(
      <Canvas
        dpr={1}
        shadows
        gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
        camera={{ position: [0.3, 1.8, 8.6], fov: 34 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.85, 0)}
        style={{ width: CARD_W, height: CARD_H }}
      >
        <CardStage data={data} onShot={(c) => finish(() => resolve(c))} />
      </Canvas>,
    );
  });
}

/* ---------- 2D-открытка ---------- */

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

function starPath(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

// Подбираем размер шрифта, чтобы строка влезла в ширину.
function fitFont(g: CanvasRenderingContext2D, text: string, weight: number, size: number, min: number, maxW: number): number {
  let s = size;
  for (; s > min; s -= 2) {
    g.font = `${weight} ${s}px ${FONT}`;
    if (g.measureText(text).width <= maxW) break;
  }
  g.font = `${weight} ${s}px ${FONT}`;
  return s;
}

// Длинное имя босса — в две строки по пробелу или дефису ближе к середине.
function splitName(g: CanvasRenderingContext2D, name: string, maxW: number): string[] {
  g.font = `900 104px ${FONT}`;
  if (g.measureText(name).width <= maxW || !/[ -]/.test(name)) return [name];
  let best = [name];
  let score = Infinity;
  for (let i = 1; i < name.length - 1; i++) {
    if (name[i] !== ' ' && name[i] !== '-') continue;
    const a = name.slice(0, name[i] === '-' ? i + 1 : i);
    const b = name.slice(i + 1);
    const s = Math.abs(g.measureText(a).width - g.measureText(b).width);
    if (s < score) {
      score = s;
      best = [a, b];
    }
  }
  return best;
}

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Собрать открытку 1080×1350: фон, кадр сцены (или портреты), надписи. */
export async function drawCard(data: CardData, scene: HTMLCanvasElement | null): Promise<HTMLCanvasElement> {
  await Promise.all(['900 104px Nunito', '800 40px Nunito', '700 30px Nunito'].map((f) => document.fonts?.load(f).catch(() => {})));
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const g = c.getContext('2d')!;
  const [top, mid, bottom] = BG[data.world] ?? BG[0];
  const glow = data.boss.glow ?? data.boss.color;
  const W = CARD_W;
  const H = CARD_H;
  const cx = W / 2;
  const sceneY = 700;

  // Небо мира.
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, top);
  sky.addColorStop(0.5, mid);
  sky.addColorStop(1, bottom);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  // Лучи победы из-за спины героя.
  g.save();
  g.translate(cx, sceneY);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const ray = g.createRadialGradient(0, 0, 0, 0, 0, 900);
    ray.addColorStop(0, 'rgba(255,230,170,0.16)');
    ray.addColorStop(1, 'rgba(255,230,170,0)');
    g.fillStyle = ray;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, 900, a, a + Math.PI / 30);
    g.closePath();
    g.fill();
  }
  g.restore();

  // Свечение в цвет босса и тёплое пятно за героем.
  const halo = g.createRadialGradient(cx + 120, sceneY - 40, 20, cx + 120, sceneY - 40, 560);
  halo.addColorStop(0, `${glow}88`);
  halo.addColorStop(1, `${glow}00`);
  g.fillStyle = halo;
  g.fillRect(0, 0, W, H);
  const warm = g.createRadialGradient(cx - 120, sceneY + 40, 10, cx - 120, sceneY + 40, 420);
  warm.addColorStop(0, 'rgba(255,200,120,0.35)');
  warm.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = warm;
  g.fillRect(0, 0, W, H);

  // Звёзды на ночном небе, искры — на дневном.
  const r = rand(data.boss.name.length * 977 + data.world * 131 + 7);
  for (let i = 0; i < 70; i++) {
    const x = r() * W;
    const y = r() * 900;
    const s = 1 + r() * 3.2;
    g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.6})`;
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.fill();
  }

  // Сцена: 3D-кадр или запасные портреты.
  if (scene) {
    g.drawImage(scene, 0, 0, W, H);
  } else {
    const base = import.meta.env.BASE_URL;
    const [bossImg, heroImg] = await Promise.all([loadImage(`${base}portraits/${data.boss.face}.png`).catch(() => null), loadImage(`${base}portraits/hero.png`).catch(() => null)]);
    g.save();
    g.globalAlpha = 0.9;
    if (bossImg) g.drawImage(bossImg, cx - 40, sceneY - 380, 520, 520);
    g.restore();
    if (heroImg) g.drawImage(heroImg, cx - 470, sceneY - 260, 560, 560);
  }

  // Конфетти поверх сцены.
  const colors = ['#ffd27a', '#ff8a5c', '#6ee7b7', '#ffffff', glow];
  for (let i = 0; i < 46; i++) {
    const x = r() * W;
    const y = 230 + r() * 640;
    if (Math.abs(x - cx) < 300 && y > 420) continue;
    g.save();
    g.translate(x, y);
    g.rotate(r() * Math.PI);
    g.fillStyle = colors[i % colors.length];
    g.globalAlpha = 0.85;
    g.fillRect(-7, -3.5, 14 + r() * 8, 7);
    g.restore();
  }

  // Затемнение сверху и снизу под надписи.
  const topShade = g.createLinearGradient(0, 0, 0, 430);
  topShade.addColorStop(0, 'rgba(8,9,16,0.78)');
  topShade.addColorStop(1, 'rgba(8,9,16,0)');
  g.fillStyle = topShade;
  g.fillRect(0, 0, W, 430);
  const botShade = g.createLinearGradient(0, 880, 0, H);
  botShade.addColorStop(0, 'rgba(8,9,16,0)');
  botShade.addColorStop(0.28, 'rgba(8,9,16,0.82)');
  botShade.addColorStop(1, 'rgba(8,9,16,0.96)');
  g.fillStyle = botShade;
  g.fillRect(0, 880, W, H - 880);

  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';

  // Логотип игры.
  g.font = `900 40px ${FONT}`;
  const brand = 'NIKITENOK ARENA';
  g.letterSpacing = '10px';
  const bw = g.measureText(brand).width + 90;
  roundRect(g, cx - bw / 2, 52, bw, 70, 35);
  const pill = g.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
  pill.addColorStop(0, '#ffb46b');
  pill.addColorStop(1, '#ff7a59');
  g.fillStyle = pill;
  g.fill();
  g.fillStyle = '#2b1206';
  g.fillText(brand, cx + 5, 101);
  g.letterSpacing = '0px';

  // Где была битва.
  fitFont(g, data.place, 800, 32, 22, W - 120);
  g.fillStyle = 'rgba(255,255,255,0.78)';
  g.fillText(data.place, cx, 172);

  // «Повержен:» и имя босса.
  g.font = `900 46px ${FONT}`;
  g.letterSpacing = '6px';
  g.fillStyle = '#ffd27a';
  g.fillText('ПОВЕРЖЕН', cx + 3, 246);
  g.letterSpacing = '0px';
  const lines = splitName(g, data.boss.name, W - 110);
  const size = Math.min(...lines.map((l) => fitFont(g, l, 900, lines.length > 1 ? 92 : 104, 54, W - 110)));
  g.font = `900 ${size}px ${FONT}`;
  lines.forEach((line, i) => {
    const y = 246 + size * 1.02 * (i + 1);
    const grad = g.createLinearGradient(0, y - size, 0, y);
    grad.addColorStop(0, '#fff6dc');
    grad.addColorStop(1, '#ffc65c');
    g.lineJoin = 'round';
    g.lineWidth = 14;
    g.strokeStyle = 'rgba(30,12,4,0.75)';
    g.strokeText(line, cx, y);
    g.shadowColor = 'rgba(255,170,60,0.55)';
    g.shadowBlur = 28;
    g.fillStyle = grad;
    g.fillText(line, cx, y);
    g.shadowBlur = 0;
  });

  // Имя и звание героя.
  const heroY = 1012;
  fitFont(g, data.heroLine, 800, 34, 24, W - 140);
  g.fillStyle = '#ffffff';
  g.fillText(data.heroLine, cx, heroY);

  // Плитки статистики.
  const gap = 16;
  const tileW = (W - 96 - gap * 3) / 4;
  const tileY = 1040;
  const tileH = 136;
  data.stats.slice(0, 4).forEach((s, i) => {
    const x = 48 + i * (tileW + gap);
    roundRect(g, x, tileY, tileW, tileH, 26);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 2;
    g.stroke();
    const mx = x + tileW / 2;
    if (s.stars != null) {
      for (let k = 0; k < 3; k++) {
        starPath(g, mx + (k - 1) * 58, tileY + 58, 26);
        g.fillStyle = k < s.stars ? '#ffd27a' : 'rgba(255,255,255,0.18)';
        g.fill();
      }
    } else {
      fitFont(g, s.value, 900, 54, 30, tileW - 24);
      g.fillStyle = '#ffffff';
      g.fillText(s.value, mx, tileY + 76);
    }
    g.font = `700 26px ${FONT}`;
    g.fillStyle = '#98a0b3';
    g.fillText(s.label, mx, tileY + 114);
  });

  // Приглашение и ссылка.
  fitFont(g, INVITE, 800, 38, 26, W - 100);
  g.fillStyle = '#f5f2ec';
  g.fillText(INVITE, cx, 1240);
  const link = BOT_LINK.replace('https://', '');
  g.font = `900 36px ${FONT}`;
  const lw = g.measureText(link).width + 64;
  roundRect(g, cx - lw / 2, 1266, lw, 58, 29);
  g.fillStyle = 'rgba(255,138,92,0.16)';
  g.fill();
  g.strokeStyle = 'rgba(255,138,92,0.7)';
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = '#ffb46b';
  g.fillText(link, cx, 1307);

  return c;
}

/** Готовая открытка PNG. Без WebGL — с портретами вместо 3D. */
export async function makeShareCard(data: CardData): Promise<Blob> {
  const scene = await renderCardScene(data).catch(() => null);
  const card = await drawCard(data, scene);
  return new Promise((resolve, reject) => card.toBlob((b) => (b ? resolve(b) : reject(new Error('не удалось сохранить картинку'))), 'image/png'));
}

/* ---------- Отправка ---------- */

export const shareText = (boss: string) => `Я победил босса «${boss}» в NikitenokArena! ${INVITE}`;

/** Поделиться картинкой: системное меню с файлом, загрузка через Telegram (нужна https-ссылка) или скачивание. */
export async function shareImage(blob: Blob, text: string, url?: string): Promise<'shared' | 'saved' | 'cancelled'> {
  const name = 'atletia-pobeda.png';
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, title: 'NikitenokArena' });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  if (url?.startsWith('https://') && tg?.downloadFile) {
    tg.downloadFile({ url, file_name: name });
    return 'saved';
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
  return 'saved';
}

/* ---------- Кнопка и окно предпросмотра ---------- */

export function ShareVictory({ card }: { card: () => CardData }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [img, setImg] = useState<{ blob: Blob; url: string; boss: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (img) URL.revokeObjectURL(img.url);
    },
    [img],
  );

  const make = async () => {
    setOpen(true);
    setNote(null);
    if (img) return;
    setBusy(true);
    try {
      const data = card();
      const blob = await makeShareCard(data);
      setImg({ blob, url: URL.createObjectURL(blob), boss: data.boss.name });
    } catch {
      setNote('Не получилось нарисовать открытку');
    } finally {
      setBusy(false);
    }
  };

  const shareCard = async () => {
    if (!img) return;
    const r = await shareImage(img.blob, `${shareText(img.boss)} ${BOT_LINK}`);
    if (r === 'saved') setNote('Картинка сохранена. Если не скачалась — зажми её и выбери «Сохранить».');
  };

  const sendFriend = async () => {
    const r = await share(BOT_LINK, shareText(img?.boss ?? card().boss.name)).catch(() => null);
    if (r === 'copied') setNote('Ссылка скопирована');
  };

  return (
    <>
      <button className="secondary" onClick={make}>
        Поделиться победой
      </button>
      {open && (
        <div className="sheet" onClick={() => setOpen(false)}>
          <div className="sheet-body share-card" onClick={(e) => e.stopPropagation()}>
            <div className="share-card-preview">{img ? <img src={img.url} alt="Открытка победы" /> : <div className="share-card-wait">{busy ? 'Рисую открытку…' : ''}</div>}</div>
            {note && <div className="muted share-card-note">{note}</div>}
            <button className="primary" disabled={!img} onClick={shareCard}>
              Поделиться
            </button>
            <button className="secondary" onClick={sendFriend}>
              Отправить другу
            </button>
            <button className="link" onClick={() => setOpen(false)}>
              Закрыть
            </button>
          </div>
        </div>
      )}
    </>
  );
}
