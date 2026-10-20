import { CHARGE_MAX, villageOf } from '../resources';
import type { Progress } from '../progress';
import { Bolt, MonsterFace } from './art';
import { dailyBonusReady, DUNGEON_LANDS, dungeonOf, FLOOR_COST, FLOOR_COUNT, floorDef } from './dungeon';
import './dungeon.css';

// Карточка подземелья на главном экране. Лёгкая: доска и анимации грузятся по нажатию.

export function DungeonEntry({ progress, onOpen }: { progress: Progress; onOpen: () => void }) {
  const charge = villageOf(progress).charge;
  const f = floorDef(Math.min(FLOOR_COUNT, dungeonOf(progress).reached));
  const L = DUNGEON_LANDS[f.land];
  const ready = charge >= FLOOR_COST;
  const m = f.monster ?? { shape: L.boss[1], color: L.boss[2] };
  return (
    <button className={`m3-entry ${ready ? 'ready' : ''}`} style={{ ['--la' as string]: L.accent, ['--lb' as string]: L.bg }} onClick={onOpen}>
      <span className="m3-entry-face">
        <MonsterFace shape={m.shape} color={m.color} boss={f.boss} size={46} />
      </span>
      <span className="prog-card-text">
        <b>
          Подземелье · <Bolt size={14} className="m3-bolt" /> {charge}
        </b>
        <small>
          {ready ? `Этаж ${f.id}: ${L.name}` : `Заряд копится от повторов: ещё ${FLOOR_COST - charge} до этажа`}
          {ready && dailyBonusReady(progress, Date.now()) ? ' · бонус дня' : ''}
        </small>
        <span className="m3-entry-bar">
          <span style={{ width: `${(charge / CHARGE_MAX) * 100}%` }} />
        </span>
      </span>
      {ready && <span className="ach-entry-new">×{Math.floor(charge / FLOOR_COST)}</span>}
      <span className="chev">›</span>
    </button>
  );
}
