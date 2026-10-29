import { ReactNode, Suspense, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Canvas3D } from '../three/Canvas3D';
import { Character } from '../three/Character';
import { Check, Chest, Coin, Flask, HolidayToken, Lock } from '../icons';
import { Sheet } from '../Sheet';
import { Portrait } from './Dialog';
import { daysUntil, fmtDays, fmtLeft } from './event';
import { claimHoliday, HOLIDAY_GOAL, HOLIDAY_STEPS, holidayAt, holidayOf, holidayOutfit, holidaysSoFar, holidayTitleName, holidayTokens, type HolidayStep, type HolidayWindow, tokenWord } from './holidays';
import { OutfitFace } from './EventScreen';
import type { Progress } from './progress';
import { say } from './story';
import { sfx } from '../audio';
import './holiday.css';
import { locale, t } from '../i18n';

// Праздник Атлетии: жетоны за повторы, дорожка наград и облик этого года, который потом не получить.

function Spin({ children }: { children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.5;
  });
  return <group ref={g}>{children}</group>;
}

/** Облик-награда в 3D на подставке цвета праздника. */
function OutfitStage({ w }: { w: HolidayWindow }) {
  const item = holidayOutfit(w);
  return (
    <Canvas3D camera={{ position: [0, 1.3, 5.4], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, 0.95, 0)}>
      <hemisphereLight args={['#ffffff', '#30243a', 1.3]} />
      <directionalLight position={[3, 5, 3]} intensity={2.2} />
      <pointLight position={[-2, 1.6, -1.4]} intensity={10} color={w.def.glow} />
      <mesh position={[0, -0.07, 0]}>
        <cylinderGeometry args={[0.95, 1.05, 0.14, 24]} />
        <meshStandardMaterial color="#2a2436" />
      </mesh>
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.84, 0.95, 40]} />
        <meshBasicMaterial color={w.def.accent} />
      </mesh>
      <Suspense fallback={null}>
        <Spin>
          <Character model={item.hero} tint={item.tint} aura={item.glow} anim="idle" />
        </Spin>
      </Suspense>
    </Canvas3D>
  );
}

const fmtDate = (tm: number) => new Date(tm).toLocaleDateString(locale(), { day: 'numeric', month: 'long' });

function StepPrize({ step, w }: { step: HolidayStep; w: HolidayWindow }) {
  if ('coins' in step)
    return (
      <>
        <Coin size={18} className="coin" /> {t('{0} монет', { 0: step.coins })}
      </>
    );
  if ('potion' in step)
    return (
      <>
        <Flask size={22} color={step.potion === 'vigor' ? '#ff6b81' : '#ffb46b'} /> {step.potion === 'vigor' ? t('Зелья жизни') : t('Эликсиры силы')} ×{step.n}
      </>
    );
  if ('chest' in step)
    return (
      <>
        <Chest size={22} /> {t('Праздничный сундук')}
      </>
    );
  if ('title' in step) return <>{t('Титул «{0}»', { 0: holidayTitleName(w) })}</>;
  const item = holidayOutfit(w);
  return (
    <>
      <OutfitFace id={item.id} size={30} /> {t('Облик «{0}»', { 0: item.name })}
    </>
  );
}

export function HolidayScreen({ progress, setProgress, onClose }: { progress: Progress; setProgress: (p: Progress) => void; onClose: () => void }) {
  const now = Date.now();
  const w = holidayAt(now);
  const tokens = w.live ? holidayTokens(progress, w) : 0;
  const claimed = holidayOf(progress, w).claimed;
  const outfit = holidayOutfit(w);
  const [toast, setToast] = useState<string | null>(null);
  const story = say(w.def.npc, w.live ? w.def.story[1] : w.def.story[0]);
  // Облики прошлых праздников, которые герой успел забрать.
  const past = holidaysSoFar(now).filter((h) => h.key !== w.key && progress.items.includes(holidayOutfit(h).id));

  const claim = (at: number) => {
    const r = claimHoliday(progress, at, Date.now());
    if (!r) return;
    setProgress(r.progress);
    sfx('chest');
    setToast(r.label);
    setTimeout(() => setToast((tm) => (tm === r.label ? null : tm)), 2600);
  };

  return (
    <Sheet onClose={onClose} bodyClassName="hol-sheet" bodyStyle={{ ['--ha' as string]: w.def.accent, ['--hg' as string]: w.def.glow, ['--hs1' as string]: w.def.sky[0], ['--hs2' as string]: w.def.sky[1] }}>
      <div className="hol-hero">
        <div className="hol-head">
          <div className="hol-kicker">{w.live ? t('Праздник · до {0}', { 0: fmtDate(w.end - 1) }) : t('Скоро праздник · {0}', { 0: fmtDays(daysUntil({ ...w, key: w.key, live: false }, now)) })}</div>
          <div className="hol-name">{w.def.name}</div>
          <div className="hol-dates">
            {fmtDate(w.start)} – {fmtDate(w.end - 1)}
            {w.live && <> {t('· ещё {0}', { 0: fmtLeft(w.end - now) })}</>}
          </div>
          <div className="hol-count">
            <HolidayToken id={w.def.id} size={30} />
            <b>{tokens.toLocaleString(locale())}</b>
            <span>
              {t('{0} из {1}', { 0: tokenWord(w.def, tokens), 1: HOLIDAY_GOAL.toLocaleString(locale()) })}
            </span>
          </div>
        </div>
        <div className="hol-stage">
          <OutfitStage w={w} />
          <div className="hol-stage-name">{outfit.name}</div>
        </div>
      </div>

      <div className="hol-story">
        <Portrait line={story} size={44} />
        <div>
          <b style={{ color: story.color }}>{story.who}</b>
          <p>{story.text}</p>
        </div>
      </div>

      <div className="hol-rule">
        <HolidayToken id={w.def.id} size={16} /> {t('1 повтор = 1 {0}.', { 0: w.def.token[0] })} {w.live ? t('Считаются все повторы этих дней: карта, дуэли, программы, рейды.') : t('Жетоны начнут падать с первого дня праздника.')}
      </div>

      <div className="hol-track">
        {HOLIDAY_STEPS.map((s) => {
          const got = claimed.includes(s.at);
          const ready = w.live && !got && tokens >= s.at;
          const big = 'outfit' in s || 'title' in s;
          return (
            <div key={s.at} className={`hol-step ${got ? 'got' : ready ? 'ready' : ''} ${big ? 'big' : ''}`}>
              <div className="hol-step-at">
                <HolidayToken id={w.def.id} size={14} /> {s.at.toLocaleString(locale())}
              </div>
              <div className="hol-step-prize">
                <StepPrize step={s} w={w} />
              </div>
              <div className="hol-step-act">
                {got ? (
                  <span className="hol-got">
                    <Check size={14} /> {t('есть')}
                  </span>
                ) : ready ? (
                  <button className="small-btn" onClick={() => claim(s.at)}>
                    {t('Забрать')}
                  </button>
                ) : (
                  <span className="hol-left">
                    <Lock size={12} /> {w.live ? t('ещё {0}', { 0: (s.at - tokens).toLocaleString(locale()) }) : ''}
                  </span>
                )}
              </div>
              <div className="hol-step-bar">
                <span style={{ width: `${Math.min(100, (tokens / s.at) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="hol-note">
        {t('Облик «{0}» и титул праздника выдаются только до {1}. Потом их не получить: в следующем году будет другой наряд.', { 0: outfit.name, 1: fmtDate(w.end - 1) })}
      </div>

      {past.length > 0 && (
        <div className="hol-past">
          <div className="section-title">{t('Твои праздничные облики')}</div>
          <div className="hol-past-row">
            {past.map((h) => (
              <span key={h.key} className="hol-past-item">
                <OutfitFace id={holidayOutfit(h).id} size={40} />
                <small>{holidayOutfit(h).name}</small>
              </span>
            ))}
          </div>
        </div>
      )}
      {toast && <div className="toast global">{toast}</div>}
    </Sheet>
  );
}
