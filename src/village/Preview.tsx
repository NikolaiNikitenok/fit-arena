import { Suspense, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useLib } from '../three/kit';
import { useSettings } from '../settings';
import type { BuildingType } from '../../shared/village';
import { lookOf } from './looks';
import { lookGroup } from './looks3d';

// Мини-модели построек в меню стройки и в карточке улучшения. Один общий WebGL-рендерер вне
// экрана снимает постройку с нескольких сторон в полоску кадров; дальше это обычная картинка,
// которую CSS листает по кругу — постройка медленно вертится без своего холста и без кадров GPU.
// В экономном режиме — один неподвижный кадр. Снимки кешируются по типу и уровню.

const PX = 128;
const FRAMES = 36;
const PITCH = (28 * Math.PI) / 180;

let renderer: THREE.WebGLRenderer | null = null;
let idle = 0;
const cache = new Map<string, Promise<string>>();
let chain: Promise<unknown> = Promise.resolve();

function getRenderer(): THREE.WebGLRenderer {
  clearTimeout(idle);
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    renderer.setSize(PX, PX, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Как у сцены деревни (R3F по умолчанию): цвета превью совпадают с картой.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}
// Когда все снимки готовы, рендерер освобождает свой WebGL: на слабых телефонах контекстов мало.
function release() {
  clearTimeout(idle);
  idle = window.setTimeout(() => {
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer = null;
  }, 4000);
}

function shoot(group: THREE.Group, frames: number): Promise<string> {
  const r = getRenderer();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#5a4a38', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 2.4);
  sun.position.set(5, 9, 4);
  scene.add(sun);
  const spin = new THREE.Group();
  spin.add(group);
  scene.add(spin);
  // Рамка по постройке: радиус вокруг оси вращения и высота.
  const box = new THREE.Box3().setFromObject(group);
  const rad = Math.max(Math.hypot(box.max.x, box.max.z), Math.hypot(box.min.x, box.min.z), Math.hypot(box.max.x, box.min.z), Math.hypot(box.min.x, box.max.z));
  const h = box.max.y;
  const half = Math.max(1.1, rad, (h * Math.cos(PITCH) + 2 * rad * Math.sin(PITCH)) / 2) * 1.04;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 100);
  // Центр кадра — середина постройки по высоте: тогда она целиком входит в квадрат half×half.
  const dir = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
  cam.position.set(0, h / 2, 0).addScaledVector(dir, 30);
  cam.lookAt(0, h / 2, 0);
  const sheet = document.createElement('canvas');
  sheet.width = PX * frames;
  sheet.height = PX;
  const g = sheet.getContext('2d')!;
  for (let k = 0; k < frames; k++) {
    // Начинаем с вида как в деревне (с юго-востока) и обходим по кругу.
    spin.rotation.y = -Math.PI / 4 - (k / frames) * Math.PI * 2;
    r.render(scene, cam);
    g.drawImage(r.domElement, k * PX, 0);
  }
  release();
  return new Promise((res) => {
    if (sheet.toBlob) sheet.toBlob((b) => res(b ? URL.createObjectURL(b) : sheet.toDataURL()), 'image/webp', 0.9);
    else res(sheet.toDataURL());
  });
}

/** Снимок постройки: адрес картинки-полоски из frames кадров. */
function useShot(t: BuildingType, l: number, frames: number): string | null {
  const fantasy = useLib('fantasy');
  const village = useLib('village');
  const key = `${t}:${l}:${frames}`;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let p = cache.get(key);
    if (!p) {
      // Снимаем по очереди и между снимками отдаём кадр интерфейсу.
      p = chain.then(
        () =>
          new Promise<string>((res, rej) =>
            requestAnimationFrame(() => {
              try {
                res(shoot(lookGroup(lookOf(t, l), { fantasy, village, space: undefined, city: undefined }), frames));
              } catch (e) {
                rej(e);
              }
            }),
          ),
      );
      chain = p.catch(() => undefined);
      cache.set(key, p);
      p.catch(() => cache.delete(key));
    }
    p.then((u) => alive && setUrl(u)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key, t, l, frames, fantasy, village]);
  return url;
}

function Shot({ t, l, size }: { t: BuildingType; l: number; size: number }) {
  const s = useSettings();
  const still = s.lowPower;
  const frames = still ? 1 : FRAMES;
  const url = useShot(t, l, frames);
  if (!url) return <span className={`vil-swatch b-${t}`} style={{ width: size, height: size }} />;
  return (
    <span
      className={`vil-thumb ${still ? '' : 'spin'}`}
      style={{ width: size, height: size, backgroundImage: `url(${url})`, backgroundSize: `${frames * 100}% 100%`, animationDuration: `${FRAMES / 4}s` }}
      role="img"
      aria-label="Модель постройки"
    />
  );
}

/** Мини-модель постройки t уровня l. */
export function Preview({ t, l = 1, size = 60 }: { t: BuildingType; l?: number; size?: number }) {
  return (
    <Suspense fallback={<span className={`vil-swatch b-${t}`} style={{ width: size, height: size }} />}>
      <Shot t={t} l={l} size={size} />
    </Suspense>
  );
}
