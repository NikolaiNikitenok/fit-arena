import { CHARGE_MAX, villageOf } from '../resources';
import type { Progress } from '../progress';
import { Bolt, MonsterFace } from './art';
import { dailyBonusReady, dungeonOf, FLOOR_COST, floorDef, landDef } from './dungeon';
import './dungeon.css';
import { t } from '../../i18n';

// Карточка подземелья на главном экране. Лёгкая: доска и анимации грузятся по нажатию.

export function DungeonEntry({ progress, onOpen }: { progress: Progress; onOpen: () => void }) {
  const charge = villageOf(progress).charge;
  const d = dungeonOf(progress);
  // Незаконченный этаж важнее следующего: его можно доиграть без заряда.
  const unfinished = d.run?.floor;
  const f = floorDef(unfinished ?? d.reached);
  const L = landDef(f.land);
  const ready = charge >= FLOOR_COST || !!unfinished;
  const m = f.monster ?? { shape: L.boss[1], color: L.boss[2] };
  return (
    <button className={`m3-entry ${ready ? 'ready' : ''}`} style={{ ['--la' as string]: L.accent, ['--lb' as string]: L.bg }} onClick={onOpen}>
      <span className="m3-entry-face">
        <MonsterFace shape={m.shape} color={m.color} boss={f.boss} size={46} />
      </span>
      <span className="prog-card-text">
        <b>
          {t('Подземелье')} · <Bolt size={14} className="m3-bolt" /> {charge}
        </b>
        <small>
          {unfinished ? t('Этаж {0} не доигран — продолжи', { 0: f.id }) : ready ? t('Этаж {0}: {1}', { 0: f.id, 1: L.name }) : t('Заряд копится от повторов: ещё {0} до этажа', { 0: FLOOR_COST - charge })}
          {ready && !unfinished && dailyBonusReady(progress, Date.now()) ? t(' · бонус дня') : ''}
        </small>
        <span className="m3-entry-bar">
          <span style={{ width: `${(charge / CHARGE_MAX) * 100}%` }} />
        </span>
      </span>
      {!unfinished && charge >= FLOOR_COST && <span className="ach-entry-new">×{Math.floor(charge / FLOOR_COST)}</span>}
      <span className="chev">›</span>
    </button>
  );
}
