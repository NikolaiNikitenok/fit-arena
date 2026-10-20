import { type ReactNode, type RefObject, useLayoutEffect, useState } from 'react';
import { GemIcon, ResIcon } from './art';

// «Как играть»: три шага поверх партии со стрелкой к нужному месту. Показывается при первом
// входе в партию; из списка этажей открывается кнопкой «Как играть» (там — без стрелок).

const KEY = 'fit-arena-m3-howto';

export function howToSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Без хранилища покажем ещё раз — не страшно.
  }
}

export interface HowToTargets {
  board?: RefObject<HTMLElement | null>;
  hud?: RefObject<HTMLElement | null>;
  loot?: RefObject<HTMLElement | null>;
}

const STEPS: { target: keyof HowToTargets; title: string; body: ReactNode }[] = [
  {
    target: 'board',
    title: 'Меняй соседние самоцветы',
    body: (
      <>
        Проведи пальцем или нажми два соседних самоцвета: три одинаковых в ряд исчезают. 4 в ряд — луч, уголок — бомба, 5 в ряд — радуга.
      </>
    ),
  },
  {
    target: 'hud',
    title: 'Цель этажа сверху',
    body: (
      <>
        <GemIcon kind="sword" /> мечи бьют чудовище, <GemIcon kind="heart" /> сердца лечат героя. Следи за счётчиком ходов и за тем, когда чудовище ударит.
      </>
    ),
  },
  {
    target: 'loot',
    title: 'Добыча идёт в деревню',
    body: (
      <>
        <ResIcon res="wood" /> дерево, <ResIcon res="stone" /> камень и <ResIcon res="gold" /> золото копятся за каждый ход. Победа удваивает их бонусом этажа, а поражение оставляет половину.
      </>
    ),
  },
];

export function HowTo({ targets, onDone }: { targets?: HowToTargets; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const s = STEPS[step];
  useLayoutEffect(() => {
    const el = targets?.[s.target]?.current;
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step, s.target, targets]);
  const done = () => {
    markSeen();
    onDone();
  };
  const last = step === STEPS.length - 1;
  // Карточка — с той стороны, где больше места; стрелка смотрит на подсвеченное место.
  const below = rect ? rect.top + rect.height / 2 < window.innerHeight / 2 : false;
  return (
    <div className="m3-howto" onClick={(e) => e.stopPropagation()}>
      {rect ? <div className="m3-howto-spot" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} /> : <div className="m3-howto-dim" />}
      <div className={`m3-howto-card ${rect ? (below ? 'below' : 'above') : 'center'}`} style={rect ? (below ? { top: Math.min(window.innerHeight - 230, rect.bottom + 52) } : { top: Math.max(12, rect.top - 230) }) : undefined}>
        {rect && (
          <svg className={`m3-howto-arrow ${below ? 'up' : 'down'}`} width="34" height="40" viewBox="0 0 34 40" aria-hidden="true">
            <path d="M17 38V6M5 17L17 4l12 13" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <div className="m3-howto-step">
          Как играть · {step + 1} из {STEPS.length}
        </div>
        <b>{s.title}</b>
        <div className="m3-howto-body">{s.body}</div>
        <div className="m3-howto-actions">
          <button className="link" onClick={done}>
            Пропустить
          </button>
          <span className="m3-howto-dots">
            {STEPS.map((_, i) => (
              <i key={i} className={i === step ? 'on' : ''} />
            ))}
          </span>
          <button className="primary" onClick={() => (last ? done() : setStep(step + 1))}>
            {last ? 'Понятно' : 'Дальше'}
          </button>
        </div>
      </div>
    </div>
  );
}
