import { useEffect, useState } from 'react';
import { CameraGuide } from '../CameraGuide';
import { Banner, MapIcon, Shield, Swords } from '../icons';
import { Portrait } from './Dialog';
import { NPCS } from './npcs';
import { track } from '../telemetry';
import { openPrivacy } from '../privacy';

const GROM = { face: 'grom', color: NPCS.grom.color, who: NPCS.grom.name };

/** Знакомство при первом запуске: Мастер Гром рассказывает, как всё устроено, и ведёт на первое испытание. */
export function Onboarding({ onDone, replay }: { onDone: (start: boolean) => void; replay?: boolean }) {
  const [step, setStep] = useState(0);
  const steps = [
    {
      title: 'Добро пожаловать в NikitenokArena!',
      text: 'Я Мастер Гром. Князь Диван усыпил королевство Атлетию ленью, и разбудить его можно только движением. Здесь каждый твой повтор — удар по врагу, шаг по карте и сила героя.',
    },
    {
      title: 'Камера считает сама',
      text: 'Поставь телефон сбоку на уровне пояса, чтобы в кадр попадало всё тело. Видео никуда не уходит: распознавание работает прямо на телефоне.',
      extra: (
        <>
          <CameraGuide exercise="squat" compact />
          <button className="link inline onb-privacy" onClick={openPrivacy}>
            Политика конфиденциальности
          </button>
        </>
      ),
    },
    {
      title: 'Четыре раздела',
      extra: (
        <div className="onb-tabs">
          <div>
            <Shield size={20} /> <b>Герой</b> — твой уровень, снаряжение и задание дня от жителей.
          </div>
          <div>
            <MapIcon size={20} /> <b>Карта</b> — 300 уровней в трёх мирах, боссы и сундуки.
          </div>
          <div>
            <Banner size={20} /> <b>Клан</b> — друзья, чат и рейд-босс по выходным.
          </div>
          <div>
            <Swords size={20} /> <b>Дуэль</b> — бой с живым соперником: кто больше повторов.
          </div>
        </div>
      ),
    },
    {
      title: 'Начнём с испытания',
      text: 'Минута приседаний, сколько сможешь. Так я пойму твою форму и подберу врагов по силе: дальше они будут расти вместе с тобой.',
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
          {last ? (replay ? 'Понятно' : 'Начать испытание') : 'Дальше'}
        </button>
        <button className="link" onClick={() => done(false)}>
          {last ? (replay ? 'Закрыть' : 'Сначала осмотрюсь') : 'Пропустить'}
        </button>
      </div>
    </div>
  );
}
