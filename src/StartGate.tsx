import { useEffect } from 'react';
import { Play } from './icons';
import { useSport } from './settings';
import { sfx } from './audio';
import { say } from './voice';
import { t } from './i18n';

interface Props {
  // Что впереди: «Уровень 12 · Приседания», «Дуэль с Лисой».
  title: string;
  // Что делать до нажатия.
  sub?: string;
  // Подсказка камеры («Отойди дальше…»); null — игрок виден целиком.
  hint?: string | null;
  label?: string;
  onGo: () => void;
}

/** Камера включена, игрок видит себя в большом окне и сам решает, когда начать: бой не стартует внезапно. */
export function StartGate({ title, sub = t('Покажи камере положение для выбранного упражнения'), hint, label = t('Начать'), onGo }: Props) {
  const sport = useSport();
  useEffect(() => say(t('Камера готова. Нажми «Начать», когда встанешь')), []);
  return (
    <div className={`gate ${sport ? 'sport' : ''}`}>
      <div className="gate-card">
        <div className="gate-title">{title}</div>
        <div className="gate-sub">{sub}</div>
        <div role="status" className={`gate-hint ${hint ? 'warn' : 'ok'}`}>{hint ?? t('Вижу тебя — можно начинать')}</div>
        <button
          className="gate-go"
          disabled={!!hint}
          onClick={() => {
            sfx('go');
            onGo();
          }}
        >
          <span className="gate-ring" aria-hidden />
          <span className="gate-ring two" aria-hidden />
          <Play size={30} />
          <b>{label}</b>
        </button>
        <div className="gate-note">{t('Дождись устойчивого положения. Во время подготовки таймер упражнения не идёт')}</div>
      </div>
    </div>
  );
}

/** Перерыв между упражнениями босса: время стоит, «Продолжить» — когда готов к следующему. */
export function RestBreak({ done, next, nextGoal, step, steps, seconds, onGo }: { done: string; next: string; nextGoal?: number; step: number; steps: number; seconds: number; onGo: () => void }) {
  const sport = useSport();
  useEffect(() => say(t('Перерыв. Дальше: {0}', { 0: next.toLowerCase() })), [next]);
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');
  return (
    <div className={`gate rest ${sport ? 'sport' : ''}`}>
      <div className="gate-card">
        <div className="gate-kicker">{t('Упражнение {0} из {1} готово', { 0: step, 1: steps })}</div>
        <div className="gate-title">{t('{0} — сделано!', { 0: done })}</div>
        <div className="rest-clock">
          {mm}:{ss}
          <small>{t('перерыв · время боя стоит')}</small>
        </div>
        <div className="rest-next">
          <small>{t('Дальше')}</small>
          <b>
            {next}
            {nextGoal != null && <span> × {nextGoal}</span>}
          </b>
        </div>
        <div className="rest-dots">
          {Array.from({ length: steps }, (_, i) => (
            <span key={i} className={i < step ? 'on' : i === step ? 'next' : ''} />
          ))}
        </div>
        <button
          className="gate-go wide"
          onClick={() => {
            sfx('go');
            onGo();
          }}
        >
          <Play size={22} />
          <b>{t('Продолжить')}</b>
        </button>
        <div className="gate-note">{t('Подыши, попей воды. После нажатия будет отсчёт, чтобы встать в позицию')}</div>
      </div>
    </div>
  );
}
