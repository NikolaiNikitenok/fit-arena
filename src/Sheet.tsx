import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/**
 * Нижняя шторка: затемнение + лист снизу.
 * Полоска сверху — настоящая ручка: лист тянется пальцем вниз и закрывается, если отпустить ниже трети
 * или смахнуть быстро. Тянуть можно и за сам лист, но только когда его содержимое прокручено до верха,
 * иначе жест остаётся прокруткой. Крестик справа, тап по затемнению — тоже закрывают (с анимацией).
 */
export function Sheet({
  onClose,
  className,
  bodyClassName,
  bodyStyle,
  children,
}: {
  onClose: () => void;
  className?: string;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closing = useRef(false);

  const dismiss = () => {
    const root = rootRef.current;
    const body = bodyRef.current;
    if (closing.current) return;
    closing.current = true;
    if (!root || !body) return closeRef.current();
    body.style.transition = 'transform .2s ease-in';
    body.style.transform = 'translateY(110%)';
    root.style.transition = 'background-color .2s ease-in';
    root.style.backgroundColor = 'rgba(5,6,10,0)';
    window.setTimeout(() => closeRef.current(), 190);
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    const root = rootRef.current;
    const body = bodyRef.current;
    if (!root || !body) return;

    // Состояние жеста: null — ещё не решили (тянуть или прокручивать), true — тянем, false — не наш жест.
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let speed = 0;
    let fromGrip = false;
    let drag: boolean | null = false;
    let target: EventTarget | null = null;

    const scrolledInside = (el: EventTarget | null) => {
      for (let n = el as HTMLElement | null; n && n !== root; n = n.parentElement) {
        if (n.scrollTop > 0) return true;
      }
      return false;
    };
    const move = (dy: number) => {
      const d = Math.max(0, dy);
      body.style.transform = `translateY(${d}px)`;
      root.style.backgroundColor = `rgba(5,6,10,${0.6 * Math.max(0.2, 1 - d / body.offsetHeight)})`;
    };
    const begin = (x: number, y: number, t: EventTarget | null) => {
      if (closing.current) return;
      startX = x;
      startY = lastY = y;
      lastT = performance.now();
      speed = 0;
      target = t;
      fromGrip = !!(t as HTMLElement | null)?.closest?.('.sheet-top');
      drag = fromGrip ? true : null;
      if (drag) body.style.transition = 'none';
    };
    const step = (x: number, y: number, e: Event) => {
      if (drag === false || closing.current) return;
      const dx = x - startX;
      const dy = y - startY;
      if (drag === null) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        // Тянем лист только вниз, только почти вертикально и только если ничего внутри не прокручено.
        if (dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.3 && !scrolledInside(target)) {
          drag = true;
          startY = y;
          body.style.transition = 'none';
        } else {
          drag = false;
          return;
        }
      }
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      if (now > lastT) speed = (y - lastY) / (now - lastT);
      lastY = y;
      lastT = now;
      move(y - startY);
    };
    const end = () => {
      if (drag !== true || closing.current) {
        drag = false;
        return;
      }
      drag = false;
      const dy = lastY - startY;
      if (dy > body.offsetHeight / 3 || (dy > 40 && speed > 0.5)) {
        dismissRef.current();
        return;
      }
      body.style.transition = 'transform .22s cubic-bezier(.2,.9,.3,1.2)';
      body.style.transform = '';
      root.style.transition = 'background-color .22s ease-out';
      root.style.backgroundColor = '';
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        drag = false;
        return;
      }
      begin(e.touches[0].clientX, e.touches[0].clientY, e.target);
    };
    const onTouchMove = (e: TouchEvent) => step(e.touches[0].clientX, e.touches[0].clientY, e);
    // Мышью (компьютер, Telegram Desktop) лист тянется только за верхнюю полоску.
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (e.button !== 0 || !t.closest('.sheet-top') || t.closest('.sheet-x')) return;
      begin(e.clientX, e.clientY, e.target);
      const mm = (ev: MouseEvent) => step(ev.clientX, ev.clientY, ev);
      const mu = () => {
        window.removeEventListener('mousemove', mm);
        window.removeEventListener('mouseup', mu);
        end();
      };
      window.addEventListener('mousemove', mm);
      window.addEventListener('mouseup', mu);
    };

    body.addEventListener('touchstart', onTouchStart, { passive: true });
    body.addEventListener('touchmove', onTouchMove, { passive: false });
    body.addEventListener('touchend', end);
    body.addEventListener('touchcancel', end);
    body.addEventListener('mousedown', onMouseDown);
    return () => {
      body.removeEventListener('touchstart', onTouchStart);
      body.removeEventListener('touchmove', onTouchMove);
      body.removeEventListener('touchend', end);
      body.removeEventListener('touchcancel', end);
      body.removeEventListener('mousedown', onMouseDown);
    };
  }, []);

  return (
    <div ref={rootRef} className={className ? `sheet ${className}` : 'sheet'} onClick={dismiss}>
      <div ref={bodyRef} className={bodyClassName ? `sheet-body ${bodyClassName}` : 'sheet-body'} style={bodyStyle} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-top">
          <div className="sheet-grip" />
          <button className="sheet-x" onClick={dismiss} aria-label="Закрыть">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
