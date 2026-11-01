import { useEffect, useState } from 'react';
import { Sheet } from '../Sheet';
import { setSetting } from '../settings';
import { useBusy } from '../updates/busy';
import { portraitUrl } from '../game/npcs';
import { sfx } from '../audio';
import { unlockVoice } from '../voice';
import { track } from '../telemetry';
import { t } from '../i18n';
import { MOVES, WARMUP_SECONDS, resolveWarmup, useWarmupRequest } from './warmup';
import { RoutineRun } from './RoutineRun';
import './warmup.css';

/** Предложение размяться и сама разминка. Стоит в App один раз, открывается из withWarmup. */
export function WarmupHost() {
  const request = useWarmupRequest();
  const [running, setRunning] = useState(false);
  useBusy(request !== null);
  useEffect(() => {
    if (!request) setRunning(false);
  }, [request]);
  if (!request) return null;

  const go = (how: 'done' | 'skip' | 'off') => {
    track('warmup', how);
    resolveWarmup(true);
  };

  if (running)
    return (
      <RoutineRun
        steps={MOVES.map((m) => ({ ...m, move: m.id }))}
        doneTitle={t('Разминка готова!')}
        doneText={t('Тело разогрето — теперь в бой.')}
        doneSay={t('Разминка готова. Вперёд!')}
        doneButton={t('Поехали')}
        onDone={() => go('done')}
        onSkip={() => go('skip')}
      />
    );

  return (
    <Sheet onClose={() => resolveWarmup(false)} className="warmup-offer">
      <div className="warmup-head">
        <img src={portraitUrl('grom')} alt="" draggable={false} />
        <div>
          <h3>{t('Сначала разминка?')}</h3>
          <p className="muted">{t('Первый подход за день. {0} минуты — суставы и мышцы разогреются, повторы пойдут легче, а риск травмы меньше.', { 0: Math.round(WARMUP_SECONDS / 60) })}</p>
        </div>
      </div>
      <ol className="warmup-list">
        {MOVES.map((m) => (
          <li key={m.id}>
            <span>{m.title}</span>
            <span className="muted">{t('{0} с', { 0: m.seconds })}</span>
          </li>
        ))}
      </ol>
      <button
        className="primary"
        onClick={() => {
          unlockVoice();
          sfx('tap');
          setRunning(true);
        }}
      >
        {t('Размяться')}
      </button>
      <button className="secondary" onClick={() => go('skip')}>
        {t('Пропустить')}
      </button>
      <button
        className="link"
        onClick={() => {
          setSetting('warmup', false);
          go('off');
        }}
      >
        {t('Больше не предлагать')}
      </button>
    </Sheet>
  );
}
