import { useEffect, useRef, useState } from 'react';
import { Canvas, type CanvasProps, useThree } from '@react-three/fiber';
import { canvasProps, LOW_POWER_FPS, useSettings } from '../settings';
import { probeFps } from '../devicePerf';

// Холст 3D для всех сцен игры. Поверх обычного Canvas:
// — тени, разрешение и сглаживание по настройке «Экономный режим», в ней же не больше 30 кадров в секунду;
// — не рисует, пока холст за краем экрана или приложение свёрнуто;
// — если телефон отобрал WebGL (так бывает на слабых Android), тихо пересоздаёт сцену.

/** Экономный режим: кадр по таймеру, не чаще fps раз в секунду. */
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

export function Canvas3D({ gl, onCreated, frameloop, children, ...rest }: CanvasProps) {
  const s = useSettings();
  const p = canvasProps(s);
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

  const low = s.lowPower && (frameloop ?? 'always') === 'always';
  return (
    <Canvas
      // Смена экономного режима или потеря WebGL — сцена собирается заново с новыми параметрами.
      key={key}
      {...rest}
      shadows={p.shadows}
      dpr={p.dpr}
      gl={typeof gl === 'function' ? gl : { ...gl, ...p.gl }}
      frameloop={!visible || lost ? 'never' : low ? 'demand' : (frameloop ?? 'always')}
      onCreated={(state) => {
        current.current = state.gl.domElement;
        setEl(state.gl.domElement);
        probeFps();
        onCreated?.(state);
      }}
    >
      {low && visible && !lost && <Throttle fps={LOW_POWER_FPS} />}
      {children}
    </Canvas>
  );
}
