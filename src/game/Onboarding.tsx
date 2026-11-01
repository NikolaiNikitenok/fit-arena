import { useEffect, useState } from 'react';
import { CameraGuide } from '../CameraGuide';
import { Portrait } from './Dialog';
import { NPCS } from './npcs';
import { markFirstOpen, track } from '../telemetry';
import { preloadPose } from '../useRepCamera';
import { unlockVoice } from '../voice';
import { enableOrientation } from '../orientation';
import { openPrivacy } from '../privacy';
import { HaveHeroButton } from '../account/Account';
import { WebLoginButtons } from '../account/WebLogin';
import { useBusy } from '../updates/busy';
import { t } from '../i18n';

const GROM = { face: 'grom', color: NPCS.grom.color, who: NPCS.grom.name };

/** Знакомство при первом запуске: Мастер Гром рассказывает, как всё устроено, и ведёт на первое испытание. */
export function Onboarding({ onDone, replay }: { onDone: (start: boolean) => void; replay?: boolean }) {
  // Знакомство с игрой — без плашки «Игра обновилась» поверх.
  useBusy(true);
  const [step, setStep] = useState(0);
  // Два экрана и сразу испытание: первый засчитанный повтор — меньше чем через минуту.
  // Про разделы рассказывает Гром, когда они открываются (src/game/unlocks.ts), а не здесь.
  const steps = [
    {
      title: t('Добро пожаловать в NikitenokArena!'),
      text: t('Я Мастер Гром. Князь Диван усыпил королевство Атлетию ленью, и разбудить его можно только движением. Здесь каждый твой повтор — удар по врагу, шаг по карте и сила героя.'),
    },
    {
      title: t('Первое испытание: минута приседаний'),
      text: t('Поставь телефон на пол или стул в паре метров, чтобы в кадр попадало всё тело. Камера сама считает повторы, видео никуда не уходит.'),
      extra: (
        <>
          <CameraGuide exercise="squat" compact />
          <button className="link inline onb-privacy" onClick={openPrivacy}>
            {t('Политика конфиденциальности')}
          </button>
        </>
      ),
    },
  ];
  // Модель распознавания (≈19 МБ) качаем, пока новичок читает: к испытанию она уже готова.
  useEffect(() => {
    if (replay) return;
    markFirstOpen();
    void preloadPose().catch(() => {});
  }, [replay]);
  // Статистика: до какого шага доходят новички (повтор из настроек не считаем).
  useEffect(() => {
    if (!replay) track('onb_step', step);
  }, [step, replay]);
  const done = (start: boolean) => {
    if (!replay) track('onb_done', start ? 1 : 0);
    onDone(start);
  };
  const s = steps[step];
  const last = step === steps.length - 1;
  return (
    <div className="onboarding">
      <div className="onb-card">
        <div className="onb-dots">
          {steps.map((_, i) => (
            <span key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>
        <div className="onb-head">
          <Portrait line={GROM} size={64} />
          <div className="onb-title">{s.title}</div>
        </div>
        {s.text && <div className="onb-text">{s.text}</div>}
        {s.extra}
        <button
          className="primary"
          onClick={() => {
            if (!last) return setStep(step + 1);
            // Прямо из нажатия: иначе iOS в Telegram не даст Грому говорить на испытании.
            if (!replay) {
              unlockVoice();
              // Датчик наклона на iPhone тоже разрешается только из нажатия, а испытание стартует само.
              enableOrientation();
            }
            done(true);
          }}
        >
          {last ? (replay ? t('Понятно') : t('Начать испытание')) : t('Дальше')}
        </button>
        <button className="link" onClick={() => done(false)}>
          {last ? (replay ? t('Закрыть') : t('Сначала осмотрюсь')) : t('Пропустить')}
        </button>
        {/* Уже играл на другой платформе: привязать этот вход к тому герою (src/account). */}
        {!replay && step === 0 && <HaveHeroButton />}
        {/* Браузер: войти через Яндекс или Telegram, иначе — гостем. */}
        {!replay && step === 0 && <WebLoginButtons />}
      </div>
    </div>
  );
}
