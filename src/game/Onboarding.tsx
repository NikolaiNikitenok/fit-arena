import { useEffect, useState } from 'react';
import { CameraGuide } from '../CameraGuide';
import { Banner, MapIcon, Shield, Swords } from '../icons';
import { Portrait } from './Dialog';
import { NPCS } from './npcs';
import { track } from '../telemetry';
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
  const steps = [
    {
      title: t('Добро пожаловать в NikitenokArena!'),
      text: t('Я Мастер Гром. Князь Диван усыпил королевство Атлетию ленью, и разбудить его можно только движением. Здесь каждый твой повтор — удар по врагу, шаг по карте и сила героя.'),
    },
    {
      title: t('Камера считает сама'),
      text: t('Поставь телефон сбоку на уровне пояса, чтобы в кадр попадало всё тело. Видео никуда не уходит: распознавание работает прямо на телефоне.'),
      extra: (
        <>
          <CameraGuide exercise="squat" compact />
          <button className="link inline onb-privacy" onClick={openPrivacy}>
            {t('Политика конфиденциальности')}
          </button>
        </>
      ),
    },
    {
      title: t('Четыре раздела'),
      extra: (
        <div className="onb-tabs">
          <div>
            <Shield size={20} /> <b>{t('Герой')}</b> {t('— твой уровень, снаряжение и задание дня от жителей.')}
          </div>
          <div>
            <MapIcon size={20} /> <b>{t('Карта')}</b> {t('— 300 уровней в трёх мирах, боссы и сундуки.')}
          </div>
          <div>
            <Banner size={20} /> <b>{t('Клан')}</b> {t('— друзья, чат и рейд-босс по выходным.')}
          </div>
          <div>
            <Swords size={20} /> <b>{t('Дуэль')}</b> {t('— бой с живым соперником: кто больше повторов.')}
          </div>
        </div>
      ),
    },
    {
      title: t('Начнём с испытания'),
      text: t('Минута приседаний, сколько сможешь. Так я пойму твою форму и подберу врагов по силе: дальше они будут расти вместе с тобой.'),
    },
  ];
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
        <button className="primary" onClick={() => (last ? done(true) : setStep(step + 1))}>
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
