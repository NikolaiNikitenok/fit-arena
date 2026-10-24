import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useLib } from '../three/kit';
import { getSettings, useSettings } from '../settings';
import type { BuildingType } from '../../shared/village';
import { decorLook, lookOf } from './looks';
import type { DecorKind, ThemeId } from './decor';
import { animateGroup, lookGroup } from './looks3d';

// Мини-модели построек в меню стройки и в карточке улучшения. Один общий WebGL-рендерер вне экрана
// рисует каждую видимую мини-модель в свой маленький 2D-холст каждый кадр: постройка вертится плавно,
// с частотой экрана, и дымят трубы, машут флаги. Своего WebGL у карточек нет — на слабых телефонах
// контекстов мало. Рисуются только карточки на экране; лист закрыт — рендерер ничего не делает,
// а через несколько секунд отдаёт свой WebGL. В экономном режиме кадр меньше и без сглаживания.

const PITCH = (28 * Math.PI) / 180;
// Один оборот за столько секунд: неспешно, но заметно.
const TURN_S = 16;

interface Stage {
  scene: THREE.Scene;
  spin: THREE.Group;
  model: THREE.Group;
  cam: THREE.OrthographicCamera;
}
interface Slot {
  canvas: HTMLCanvasElement;
  key: string;
  make: () => THREE.Group;
  visible: boolean;
  // Размер на экране (CSS px): большие превью рисуются в кадр крупнее.
  size: number;
  // Неподвижный портрет (карточки в бою): рисуется один раз, рендерер потом свободен.
  still?: boolean;
  drawn?: boolean;
}

const slots = new Set<Slot>();
const stages = new Map<string, Stage>();
let renderer: THREE.WebGLRenderer | null = null;
let lite = false;
let px = 0;
let rsize = 0;
let raf = 0;
let idle = 0;
let still = false;

function stageOf(slot: Slot): Stage {
  let st = stages.get(slot.key);
  if (st) return st;
  const model = slot.make();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#5a4a38', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 2.4);
  sun.position.set(5, 9, 4);
  scene.add(sun);
  const spin = new THREE.Group();
  spin.add(model);
  scene.add(spin);
  // Своя рамка у модели (персонажи: оружие в замахе не должно уменьшать фигуру).
  const { h, half } = (model.userData.frame as { h: number; half: number } | undefined) ?? frameOf(model);
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 100);
  // Центр кадра — середина постройки по высоте: тогда она целиком входит в квадрат half×half.
  const dir = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
  cam.position.set(0, h / 2, 0).addScaledVector(dir, 30);
  cam.lookAt(0, h / 2, 0);
  st = { scene, spin, model, cam };
  stages.set(slot.key, st);
  return st;
}

/** Рамка по модели: радиус вокруг оси вращения и высота — модель целиком входит в квадрат. */
function frameOf(model: THREE.Object3D): { h: number; half: number } {
  // Детали двигаются матрицами без автообновления: мировые матрицы считаем сами, иначе рамка не та.
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const rad = Math.max(Math.hypot(box.max.x, box.max.z), Math.hypot(box.min.x, box.min.z), Math.hypot(box.max.x, box.min.z), Math.hypot(box.min.x, box.max.z));
  const h = box.max.y;
  return { h, half: Math.max(1.1, rad, (h * Math.cos(PITCH) + 2 * rad * Math.sin(PITCH)) / 2) * 1.04 };
}

function getRenderer(): THREE.WebGLRenderer {
  clearTimeout(idle);
  const low = getSettings().lowPower;
  if (renderer && low !== lite) dropRenderer();
  if (!renderer) {
    lite = low;
    // Кадр в пикселях: на обычном телефоне — по плотности экрана, в экономном режиме — меньше.
    px = low ? 96 : Math.min(192, Math.round(64 * Math.min(2.5, window.devicePixelRatio || 1)));
    renderer = new THREE.WebGLRenderer({ antialias: !low, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    renderer.setSize(px, px, false);
    rsize = px;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Как у сцены деревни (R3F по умолчанию): цвета превью совпадают с картой.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

function dropRenderer() {
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer = null;
}

function frame(nowMs: number) {
  raf = 0;
  if (!slots.size) {
    // Все карточки закрыты: через несколько секунд отдаём WebGL.
    clearTimeout(idle);
    idle = window.setTimeout(dropRenderer, 4000);
    return;
  }
  // Есть живые (вращающиеся) мини-модели — даже прокрученные за край, они вернутся.
  let moving = false;
  for (const slot of slots) if (!slot.still) moving = true;
  if (!document.hidden) {
    const t = nowMs / 1000;
    for (const slot of slots) {
      if (!slot.visible) continue;
      if (slot.still && slot.drawn) continue;
      const r = getRenderer();
      // Кадр по размеру карточки: обычные — px, крупные — пропорционально больше (не больше 384).
      const want = slot.size > 80 ? Math.min(lite ? 192 : 384, Math.round((px * slot.size) / 64)) : px;
      if (rsize !== want) {
        r.setSize(want, want, false);
        rsize = want;
      }
      if (slot.canvas.width !== want) slot.canvas.width = slot.canvas.height = want;
      const st = stageOf(slot);
      const fixed = still || slot.still;
      // Портрет — в выразительный момент движения (замах), а не в первом кадре.
      const pose = (st.model.userData.poseT as number | undefined) ?? 0;
      st.spin.rotation.y = -Math.PI / 4 - (fixed ? 0 : (t / TURN_S) * Math.PI * 2);
      animateGroup(st.model, fixed ? 0 : t);
      // Персонажи: своё движение (микшер с костями).
      (st.model.userData.tick as ((t: number) => void) | undefined)?.(fixed ? pose : t);
      r.render(st.scene, st.cam);
      const g = slot.canvas.getContext('2d');
      if (g) {
        g.clearRect(0, 0, want, want);
        g.drawImage(r.domElement, 0, 0);
      }
      slot.drawn = true;
    }
  }
  // «Меньше движения» в системе и одни портреты: кадр нарисован, дальше рендерер не нужен.
  if (!still && moving) raf = requestAnimationFrame(frame);
  else if (!moving) {
    clearTimeout(idle);
    idle = window.setTimeout(dropRenderer, 4000);
  }
}

function kick() {
  if (!raf) raf = requestAnimationFrame(frame);
}

function useSlot(ref: React.RefObject<HTMLCanvasElement | null>, key: string, make: () => THREE.Group, size = 60, fixed = false) {
  const mk = useRef(make);
  mk.current = make;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const slot: Slot = { canvas, key, make: () => mk.current(), visible: true, size, still: fixed };
    slots.add(slot);
    // Рисуем только то, что видно: прокрученные за край листа карточки не стоят ничего.
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([e]) => {
            slot.visible = e.isIntersecting;
            if (still || slot.still) kick();
          })
        : null;
    io?.observe(canvas);
    kick();
    return () => {
      io?.disconnect();
      slots.delete(slot);
      kick();
    };
  }, [ref, key, size, fixed]);
}

function Live({ t, l, size, frameL }: { t: BuildingType; l: number; size: number; frameL?: number }) {
  const fantasy = useLib('fantasy');
  const village = useLib('village');
  const s = useSettings();
  const ref = useRef<HTMLCanvasElement>(null);
  // Смена экономного режима — другой рендерер и другие детали (без дыма и искр).
  const libs = { fantasy, village, space: undefined, city: undefined };
  useSlot(ref, `${t}:${l}:${frameL ?? ''}:${s.lowPower ? 1 : 0}`, () => {
    const g = lookGroup(lookOf(t, l), libs, { lite: s.lowPower });
    // Ловушки маленькие: кадр теснее, чтобы их было видно.
    if (t === 'bomb' || t === 'snare') {
      g.userData.frame = { h: 0.45, half: 0.55 };
      return g;
    }
    // Общая рамка с уровнем frameL: рядом «сейчас → после улучшения» видно, что постройка выросла.
    if (frameL) {
      const f = frameOf(lookGroup(lookOf(t, Math.max(l, frameL)), libs, { lite: s.lowPower }));
      g.userData.frame = { h: f.h, half: f.half };
    }
    return g;
  }, size);
  return <canvas ref={ref} className="vil-thumb" width={1} height={1} style={{ width: size, height: size }} role="img" aria-label="Модель постройки" />;
}

/** Мини-модель постройки t уровня l; frameL — уровень, по которому выбрана рамка кадра. */
export function Preview({ t, l = 1, size = 60, frameL }: { t: BuildingType; l?: number; size?: number; frameL?: number }) {
  return (
    <Suspense fallback={<span className={`vil-swatch b-${t}`} style={{ width: size, height: size }} />}>
      <Live t={t} l={l} size={size} frameL={frameL} />
    </Suspense>
  );
}

/**
 * Любая мини-модель в общем рендерере: id — что это (одинаковые id делят одну сцену), make — собрать
 * модель; у модели может быть userData.tick(t) — своё движение каждый кадр (персонажи с костями).
 * still — неподвижный портрет в момент userData.poseT: рисуется один раз.
 */
export function ModelThumb({ id, make, size = 60, label, still = false }: { id: string; make: () => THREE.Group; size?: number; label: string; still?: boolean }) {
  const s = useSettings();
  const ref = useRef<HTMLCanvasElement>(null);
  useSlot(ref, `${id}:${s.lowPower ? 1 : 0}`, make, size, still);
  return <canvas ref={ref} className="vil-thumb" width={1} height={1} style={{ width: size, height: size }} role="img" aria-label={label} />;
}

function DecorLive({ k, theme, size }: { k: DecorKind; theme: ThemeId; size: number }) {
  const fantasy = useLib('fantasy');
  const village = useLib('village');
  const s = useSettings();
  const ref = useRef<HTMLCanvasElement>(null);
  const libs = { fantasy, village, space: undefined, city: undefined };
  useSlot(ref, `decor:${k}:${theme}:${s.lowPower ? 1 : 0}`, () => {
    // Дорожка — просто плитка мостовой.
    const look = k === 'path' ? { kit: [], prim: [{ k: 'box' as const, x: 0, y: 0.04, z: 0, sx: 0.95, sy: 0.08, sz: 0.95, c: '#c4a274' }], anim: [], top: 0.3, blob: 0 } : decorLook(k, theme);
    const g = lookGroup(look, libs, { lite: s.lowPower });
    const big = k.startsWith('statue') || k === 'clanflag' || k === 'oak' || k === 'pine' || k === 'snowman' || k === 'well';
    g.userData.frame = { h: big ? Math.max(1, look.top * 0.9) : 0.5, half: big ? 1.25 : 0.62 };
    return g;
  }, size);
  return <canvas ref={ref} className="vil-thumb" width={1} height={1} style={{ width: size, height: size }} role="img" aria-label="Украшение" />;
}

/** Мини-модель украшения в витрине. */
export function DecorThumb({ k, theme = 'classic', size = 60 }: { k: DecorKind; theme?: ThemeId; size?: number }) {
  return (
    <Suspense fallback={<span className="vil-swatch" style={{ width: size, height: size }} />}>
      <DecorLive k={k} theme={theme} size={size} />
    </Suspense>
  );
}
