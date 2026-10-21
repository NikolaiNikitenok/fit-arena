import type { Town } from '../../shared/village';
import { barracksLevel, levelMul, TROOP_IDS, TROOPS, type TroopId } from '../../shared/villageBattle';
import { labLevel, maxTroopLevel, REP_BOOST_MIN, researchCost, researchSpeedCharge, researchTime, TROOP_MAX_LEVEL, troopLevel } from '../../shared/villageLab';
import { Lock, Timer } from '../icons';
import { ResRow } from './BattleScreen';
import { Bolt } from './icons';
import { fmtTime } from './state';
import { TroopThumb } from './TroopInfo';
import { Sheet } from '../Sheet';

// Лаборатория: одно исследование за раз, каждый уровень отряда — +15% здоровья и урона.
// Правила и цены — shared/villageLab.ts.

interface Props {
  town: Town;
  now: number;
  charge: number;
  onResearch: (id: TroopId) => void;
  onCancel: () => void;
  onSpeed: (charge: number) => void;
  onClose: () => void;
  onBuild: () => void;
}

export function LabSheet({ town, now, charge, onResearch, onCancel, onSpeed, onClose, onBuild }: Props) {
  const lab = labLevel(town);
  const cap = maxTroopLevel(lab);
  const bl = barracksLevel(town);
  const r = town.r;
  const sp = researchSpeedCharge(town, now);
  return (
    <Sheet onClose={onClose}>
      <div className="section-title">
        Лаборатория{lab ? ` · ур. ${lab}` : ''}
        {lab > 0 && <span className="muted">отряды до {cap} ур.</span>}
      </div>
      {lab === 0 ? (
        <>
          <div className="vil-note">Лаборатория прокачивает отряды: каждый уровень — +15% здоровья и урона. Строится с ратуши 2.</div>
          <button className="primary" onClick={onBuild}>
            Строить
          </button>
        </>
      ) : (
        <>
          {r ? (
            <div className="vil-lab-now">
              <span className={`vil-troop-pic u-${r.t}`}>
                <TroopThumb id={r.t} size={52} level={troopLevel(town, r.t) + 1} />
              </span>
              <div className="vil-shop-info">
                <b>
                  {TROOPS[r.t].name}: ур. {troopLevel(town, r.t)} → {troopLevel(town, r.t) + 1}
                </b>
                <span className="vil-timer">
                  <Timer size={15} /> {fmtTime((r.end - now) / 1000)}
                </span>
                <span className="muted">Каждый повтор на тренировке — минус {REP_BOOST_MIN} мин.</span>
              </div>
              <div className="vil-lab-btns">
                <button className="primary" disabled={charge < sp} onClick={() => onSpeed(sp)}>
                  <Bolt size={15} /> {sp}
                </button>
                <button className="small-btn ghost" onClick={onCancel} aria-label="Отменить исследование">
                  ×
                </button>
              </div>
            </div>
          ) : (
            <div className="vil-note">Выбери отряд для исследования. Каждый повтор на тренировке ускоряет его на {REP_BOOST_MIN} мин.</div>
          )}
          {TROOP_IDS.map((id) => {
            const d = TROOPS[id];
            const lv = troopLevel(town, id);
            const next = lv + 1;
            const maxed = lv >= TROOP_MAX_LEVEL;
            const locked = bl < d.unlock;
            const going = r?.t === id;
            const gain = Math.round((levelMul(next) / levelMul(lv) - 1) * 100);
            return (
              <div key={id} className={`vil-task vil-troop-card ${locked ? 'locked' : ''}`}>
                <span className={`vil-troop-pic u-${id}`}>
                  <TroopThumb id={id} size={52} level={lv} />
                </span>
                <div className="vil-shop-info">
                  <b>
                    {d.name} <span className="level-tag">ур. {lv}</span>
                  </b>
                  <span className="muted">
                    {locked
                      ? `Казармы ${d.unlock} уровня`
                      : maxed
                        ? 'Самый высокий уровень'
                        : next > cap
                          ? `Уровень ${next} — с лаборатории ${next - 1}`
                          : `Уровень ${next}: +${gain}% здоровья и ${id === 'healer' ? 'лечения' : 'урона'}`}
                  </span>
                  {!locked && !maxed && next <= cap && (
                    <span className="vil-shop-meta">
                      <ResRow res={researchCost(id, next)} />
                      <span className="muted">
                        <Timer size={13} /> {fmtTime(researchTime(next))}
                      </span>
                    </span>
                  )}
                </div>
                <button className="small-btn" disabled={locked || maxed || next > cap || going || !!r} onClick={() => onResearch(id)} aria-label="Исследовать">
                  {locked || next > cap ? <Lock /> : going ? <Timer size={15} /> : '↑'}
                </button>
              </div>
            );
          })}
        </>
      )}
    </Sheet>
  );
}
