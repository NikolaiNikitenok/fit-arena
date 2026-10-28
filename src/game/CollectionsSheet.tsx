import { Sheet } from '../Sheet';
import { collectionDone, collectionItems, collectionOwned, visibleCollections, type Collection } from './collections';
import { EVENT_BOSSES } from './event';
import { OutfitFace } from './EventScreen';
import { holidayByKey } from './holidays';
import type { Item } from './items';
import type { Progress } from './progress';
import { setAura } from './progress';
import './holiday.css';

// Альбом коллекций обликов: что собрано, где найти остальное и сияние за полный комплект.

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** Где взять облик: подпись под пустой клеткой. */
export function whereToGet(i: Item, now: number): string {
  if (i.inShop) return `в лавке за ${i.price}`;
  if (i.event) {
    const m = EVENT_BOSSES.findIndex((b) => b.outfit === i.id);
    return `босс ${MONTHS[m]}`;
  }
  if (i.program) return 'программа Грома';
  if (i.ref) return i.id === 'ref-leader' ? 'приведи троих друзей' : 'приведи друга';
  if (i.titan) return 'победа над Титаном';
  if (i.pass) return 'пропуск сезона';
  if (i.holiday) {
    const w = holidayByKey(i.holiday);
    if (!w) return 'праздник';
    return w.end <= now ? 'праздник прошёл' : w.start <= now ? 'идёт праздник!' : `${w.def.name}, ${new Date(w.start).getFullYear()}`;
  }
  return 'сундуки на карте';
}

function CollectionCard({ c, progress, now, onAura }: { c: Collection; progress: Progress; now: number; onAura: (id: string | undefined) => void }) {
  const owned = collectionOwned(c, progress);
  const done = collectionDone(c, progress);
  const worn = progress.aura === c.id;
  return (
    <div className={`col-card ${done ? 'done' : ''}`} style={{ ['--ca' as string]: c.aura }}>
      <div className="col-head">
        <div>
          <div className="col-name">{c.name}</div>
          <div className="col-text">{c.text}</div>
        </div>
        <span className="col-count">
          {owned}/{c.items.length}
        </span>
      </div>
      <div className="col-items">
        {collectionItems(c).map((i) => {
          const have = progress.items.includes(i.id);
          return (
            <span key={i.id} className={`col-item ${have ? '' : 'missing'}`}>
              <OutfitFace id={i.id} size={44} />
              <small>{have ? i.name : whereToGet(i, now)}</small>
            </span>
          );
        })}
      </div>
      <div className="col-bar">
        <span style={{ width: `${(owned / c.items.length) * 100}%` }} />
      </div>
      <div className="col-foot">
        <span>
          <span className="col-aura-dot" />
          {done ? `Титул «${c.title}» в достижениях` : `За комплект: титул «${c.title}» и сияние`}
        </span>
        {done && (
          <button className={`small-btn ${worn ? 'off' : ''}`} onClick={() => onAura(worn ? undefined : c.id)}>
            {worn ? 'Снять сияние' : 'Сияние'}
          </button>
        )}
      </div>
    </div>
  );
}

export function CollectionsSheet({ progress, setProgress, onClose }: { progress: Progress; setProgress: (p: Progress) => void; onClose: () => void }) {
  const now = Date.now();
  const list = visibleCollections(now);
  // Сначала собранные, потом те, где больше половины, потом остальные.
  const sorted = [...list].sort((a, b) => Number(collectionDone(b, progress)) - Number(collectionDone(a, progress)) || collectionOwned(b, progress) / b.items.length - collectionOwned(a, progress) / a.items.length);
  const done = list.filter((c) => collectionDone(c, progress)).length;
  return (
    <Sheet onClose={onClose} bodyClassName="hol-sheet">
      <div className="level-title">
        Коллекции обликов{' '}
        <span className="muted">
          {done} из {list.length}
        </span>
      </div>
      <div className="col-tip">Собери комплект целиком: за него титул с монетами и сияние вокруг героя. Сильнее комплект не делает, только красивее.</div>
      <div className="col-list">
        {sorted.map((c) => (
          <CollectionCard key={c.id} c={c} progress={progress} now={now} onAura={(id) => setProgress(setAura(progress, id))} />
        ))}
      </div>
    </Sheet>
  );
}
