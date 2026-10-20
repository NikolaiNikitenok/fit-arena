import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useLib } from '../three/kit';
import { getSettings, useSettings } from '../settings';
import type { BuildingType } from '../../shared/village';
import { lookOf } from './looks';
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
  // Рамка по постройке: радиус вокруг оси вращения и высота.
  const box = new THREE.Box3().setFromObject(model);
  const rad = Math.max(Math.hypot(box.max.x, box.max.z), Math.hypot(box.min.x, box.min.z), Math.hypot(box.max.x, box.min.z), Math.hypot(box.min.x, box.max.z));
  // Своя рамка у модели (персонажи: оружие в замахе не должно уменьшать фигуру).
  const frame = model.userData.frame as { h: number; half: number } | undefined;
  const h = frame?.h ?? box.max.y;
  const half = frame?.half ?? Math.max(1.1, rad, (h * Math.cos(PITCH) + 2 * rad * Math.sin(PITCH)) / 2) * 1.04;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 100);
  // Центр кадра — середина постройки по высоте: тогда она целиком входит в квадрат half×half.
  const dir = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
  cam.position.set(0, h / 2, 0).addScaledVector(dir, 30);
  cam.lookAt(0, h / 2, 0);
  st = { scene, spin, model, cam };
  stages.set(slot.key, st);
  return st;
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
  if (!document.hidden) {
    const t = nowMs / 1000;
    for (const slot of slots) {
      if (!slot.visible) continue;
      const r = getRenderer();
      // Кадр по размеру карточки: обычные — px, крупные — пропорционально больше (не больше 384).
      const want = slot.size > 80 ? Math.min(lite ? 192 : 384, Math.round((px * slot.size) / 64)) : px;
      if (rsize !== want) {
        r.setSize(want, want, false);
        rsize = want;
      }
      if (slot.canvas.width !== want) slot.canvas.width = slot.canvas.height = want;
      const st = stageOf(slot);
      st.spin.rotation.y = -Math.PI / 4 - (still ? 0 : (t / TURN_S) * Math.PI * 2);
      animateGroup(st.model, still ? 0 : t);
      // Персонажи: своё движение (микшер с костями).
      (st.model.userData.tick as ((t: number) => void) | undefined)?.(still ? 0 : t);
      r.render(st.scene, st.cam);
      const g = slot.canvas.getContext('2d');
      if (g) {
        g.clearRect(0, 0, want, want);
        g.drawImage(r.domElement, 0, 0);
      }
    }
  }
  // «Меньше движения» в системе: один неподвижный кадр.
  if (!still) raf = requestAnimationFrame(frame);
}

function kick() {
  if (!raf) raf = requestAnimationFrame(frame);
}

function useSlot(ref: React.RefObject<HTMLCanvasElement | null>, key: string, make: () => THREE.Group, size = 60) {
  const mk = useRef(make);
  mk.current = make;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const slot: Slot = { canvas, key, make: () => mk.current(), visible: true, size };
    slots.add(slot);
    // Рисуем только то, что видно: прокрученные за край листа карточки не стоят ничего.
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([e]) => {
            slot.visible = e.isIntersecting;
            if (still) kick();
          })
        : null;
    io?.observe(canvas);
    kick();
    return () => {
      io?.disconnect();
      slots.delete(slot);
      kick();
    };
  }, [ref, key, size]);
}

function Live({ t, l, size }: { t: BuildingType; l: number; size: number }) {
  const fantasy = useLib('fantasy');
  const village = useLib('village');
  const s = useSettings();
  const ref = useRef<HTMLCanvasElement>(null);
  // Смена экономного режима — другой рендерер и другие детали (без дыма и искр).
  useSlot(ref, `${t}:${l}:${s.lowPower ? 1 : 0}`, () => lookGroup(lookOf(t, l), { fantasy, village, space: undefined, city: undefined }, { lite: s.lowPower }), size);
  return <canvas ref={ref} className="vil-thumb" width={1} height={1} style={{ width: size, height: size }} role="img" aria-label="Модель постройки" />;
}

/** Мини-модель постройки t уровня l. */
export function Preview({ t, l = 1, size = 60 }: { t: BuildingType; l?: number; size?: number }) {
  return (
    <Suspense fallback={<span className={`vil-swatch b-${t}`} style={{ width: size, height: size }} />}>
      <Live t={t} l={l} size={size} />
    </Suspense>
  );
}

/**
 * Любая мини-модель в общем рендерере: id — что это (одинаковые id делят одну сцену), make — собрать
 * модель; у модели может быть userData.tick(t) — своё движение каждый кадр (персонажи с костями).
 */
export function ModelThumb({ id, make, size = 60, label }: { id: string; make: () => THREE.Group; size?: number; label: string }) {
  const s = useSettings();
  const ref = useRef<HTMLCanvasElement>(null);
  useSlot(ref, `${id}:${s.lowPower ? 1 : 0}`, make, size);
  return <canvas ref={ref} className="vil-thumb" width={1} height={1} style={{ width: size, height: size }} role="img" aria-label={label} />;
}
