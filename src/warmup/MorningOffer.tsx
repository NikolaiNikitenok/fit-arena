import { useState } from 'react';
import { Sheet } from '../Sheet';
import { setSetting } from '../settings';
import { portraitUrl } from '../game/npcs';
import type { Baseline } from '../game/levels';
import { sfx } from '../audio';
import { unlockVoice } from '../voice';
import { track } from '../telemetry';
import { t } from '../i18n';
import { RoutineRun } from './RoutineRun';
import { morningDemo, morningReps } from './morning';
import { markWarmup } from './warmup';

/** Утреннее окно: «Начнём день с зарядки?». С камерой — onCamera (подходы в счёт), без — показ движений. */
export function MorningOffer({ baseline, onCamera, onClose }: { baseline: Baseline; onCamera: () => void; onClose: () => void }) {
  const [demo, setDemo] = useState(false);
  const r = morningReps(baseline);

  if (demo)
    return (
      <RoutineRun
        steps={morningDemo(baseline)}
        doneTitle={t('С добрым утром!')}
        doneText={t('Зарядка сделана, тело проснулось. Хорошего дня!')}
        doneSay={t('Зарядка сделана. Хорошего дня!')}
        doneButton={t('Готово')}
        onDone={() => {
          track('morning', 'demo_done');
          // Тело уже размято: перед первым боем разминку сегодня не предлагаем.
          markWarmup();
          onClose();
        }}
        onSkip={() => {
          track('morning', 'demo_skip');
          onClose();
        }}
      />
    );

  return (
    <Sheet onClose={onClose} className="warmup-offer">
      <div className="warmup-head">
        <img src={portraitUrl('grom')} alt="" draggable={false} />
        <div>
          <h3>{t('Доброе утро! Начнём день с зарядки?')}</h3>
          <p className="muted">{t('Пара минут: разомнёмся, потом {0} приседаний и {1} отжиманий. Бодрость на весь день.', { 0: r.squat, 1: r.pushup })}</p>
        </div>
      </div>
      <button
        className="primary morning-btn"
        onClick={() => {
          track('morning', 'camera');
          sfx('tap');
          onCamera();
        }}
      >
        <span>{t('С камерой')}</span>
        <small>{t('повторы идут в счёт')}</small>
      </button>
      <button
        className="secondary morning-btn"
        onClick={() => {
          track('morning', 'demo');
          unlockVoice();
          sfx('tap');
          setDemo(true);
        }}
      >
        <span>{t('Без камеры')}</span>
        <small>{t('просто покажу, как делать, без счёта')}</small>
      </button>
      <button
        className="link"
        onClick={() => {
          track('morning', 'off');
          setSetting('morning', false);
          onClose();
        }}
      >
        {t('Не показывать больше')}
      </button>
    </Sheet>
  );
}
