import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas, type CanvasProps, useFrame, useThree } from '@react-three/fiber';
import { canvasProps, useSettings } from '../settings';
import { CAP_FPS, fpsCapped, frameDone, probeFps, sceneStarted, subscribeCap } from '../devicePerf';
import { setOutlines } from './toon';

// Холст 3D для всех сцен игры. Поверх обычного Canvas:
// — тени, разрешение и сглаживание по настройке «Экономный режим»; кадров — с частотой экрана,
//   30 — только если в экономном режиме телефон всё равно не держит 25 (devicePerf.ts);
// — не рисует, пока холст за краем экрана или приложение свёрнуто;
// — если телефон отобрал WebGL (так бывает на слабых Android), тихо пересоздаёт сцену.

/** Считает нарисованные кадры: для решения об ограничении и для счётчика FPS у админа. */
function FrameMeter({ low }: { low: boolean }) {
  useEffect(() => sceneStarted(), []);
  useFrame(() => frameDone(performance.now(), low));
  return null;
}

/** Ограничение: кадр по таймеру, не чаще fps раз в секунду. */
function Throttle({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const step = 1000 / fps;
    const tick = (t: number) => {
      // Небольшой допуск: rAF приходит чуть раньше или позже 33 мс.
      if (t - last >= step - 4) {
        last = t;
        invalidate();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fps, invalidate]);
  return null;
}

/** Холст в кадре и вкладка видна. */
function useOnScreen(el: HTMLElement | null): boolean {
  const [inView, setInView] = useState(true);
  const [shown, setShown] = useState(() => !document.hidden);
  useEffect(() => {
    const on = () => setShown(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [el]);
  return inView && shown;
}

// Сколько раз подряд пересоздаём сцену после потери WebGL, прежде чем сдаться.
const MAX_RESTARTS = 3;

/** sharp — полное разрешение экрана (герой крупно на главной); иначе не выше 1,6 ради скорости. */
export function Canvas3D({ gl, onCreated, frameloop, children, sharp, ...rest }: CanvasProps & { sharp?: boolean }) {
  const s = useSettings();
  const p = canvasProps(s);
  // Обводка персонажей — только не в экономном режиме.
  setOutlines(!s.lowPower);
  const [el, setEl] = useState<HTMLCanvasElement | null>(null);
  const visible = useOnScreen(el);
  const [gen, setGen] = useState(0);
  const [lost, setLost] = useState(false);
  const restarts = useRef(0);
  // Холст, который сейчас на экране. Старый холст при пересоздании сцены R3F сам гасит
  // (forceContextLoss) — это не сбой, и на него не отвечаем.
  const current = useRef<HTMLCanvasElement | null>(null);
  const key = `${gen}-${s.lowPower ? 1 : 0}`;
  const lastKey = useRef(key);
  if (lastKey.current !== key) {
    lastKey.current = key;
    current.current = null;
  }

  useEffect(() => {
    if (!el) return;
    let timer = 0;
    const restart = (e?: Event) => {
      if (e && e.currentTarget !== current.current) return;
      clearTimeout(timer);
      if (restarts.current++ >= MAX_RESTARTS) return;
      setLost(false);
      setGen((g) => g + 1);
    };
    const onLost = (e: Event) => {
      if (e.currentTarget !== current.current) return;
      // Без preventDefault браузер не вернёт контекст.
      e.preventDefault();
      setLost(true);
      // Android часто так и не возвращает контекст: через пару секунд создаём новый холст.
      timer = window.setTimeout(() => restart(), 2000);
    };
    el.addEventListener('webglcontextlost', onLost);
    el.addEventListener('webglcontextrestored', restart);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('webglcontextlost', onLost);
      el.removeEventListener('webglcontextrestored', restart);
    };
  }, [el]);

  const capped = useSyncExternalStore(subscribeCap, fpsCapped);
  const low = s.lowPower && capped && (frameloop ?? 'always') === 'always';
  return (
    <Canvas
      // Смена экономного режима или потеря WebGL — сцена собирается заново с новыми параметрами.
      key={key}
      {...rest}
      shadows={p.shadows}
      dpr={sharp && !s.lowPower ? [1, 2] : p.dpr}
      gl={typeof gl === 'function' ? gl : { ...gl, ...p.gl }}
      frameloop={!visible || lost ? 'never' : low ? 'demand' : (frameloop ?? 'always')}
      onCreated={(state) => {
        current.current = state.gl.domElement;
        setEl(state.gl.domElement);
        probeFps();
        onCreated?.(state);
      }}
    >
      {low && visible && !lost && <Throttle fps={CAP_FPS} />}
      <FrameMeter low={s.lowPower} />
      {children}
    </Canvas>
  );
}
