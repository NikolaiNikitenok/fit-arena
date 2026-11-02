import { Sheet } from '../Sheet';
import { collectionDone, collectionItems, collectionOwned, visibleCollections, type Collection } from './collections';
import { EVENT_BOSSES } from './event';
import { OutfitFace } from './EventScreen';
import { holidayByKey } from './holidays';
import type { Item } from './items';
import type { Progress } from './progress';
import { setAura } from './progress';
import './holiday.css';
import { t } from '../i18n';

// Альбом коллекций обликов: что собрано, где найти остальное и сияние за полный комплект.

const MONTHS = [t('января'), t('февраля'), t('марта'), t('апреля'), t('мая'), t('июня'), t('июля'), t('августа'), t('сентября'), t('октября'), t('ноября'), t('декабря')];

/** Где взять облик: подпись под пустой клеткой. */
export function whereToGet(i: Item, now: number): string {
  if (i.inShop) return t('в лавке за {0}', { 0: i.price });
  if (i.event) {
    const m = EVENT_BOSSES.findIndex((b) => b.outfit === i.id);
    return t('босс {0}', { 0: MONTHS[m] });
  }
  if (i.program) return t('программа Грома');
  if (i.ref) return i.id === 'ref-leader' ? t('приведи троих друзей') : t('приведи друга');
  if (i.titan) return t('победа над Титаном');
  if (i.channel) return t('подписка на канал игры');
  if (i.pass) return t('пропуск сезона');
  if (i.holiday) {
    const w = holidayByKey(i.holiday);
    if (!w) return t('праздник');
    return w.end <= now ? t('праздник прошёл') : w.start <= now ? t('идёт праздник!') : `${w.def.name}, ${new Date(w.start).getFullYear()}`;
  }
  return t('сундуки на карте');
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
          {done ? t('Титул «{0}» в достижениях', { 0: c.title }) : t('За комплект: титул «{0}» и сияние', { 0: c.title })}
        </span>
        {done && (
          <button className={`small-btn ${worn ? 'off' : ''}`} onClick={() => onAura(worn ? undefined : c.id)}>
            {worn ? t('Снять сияние') : t('Сияние')}
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
        {t('Коллекции обликов{0}', { 0: ' ' })}
        <span className="muted">
          {t('{0} из {1}', { 0: done, 1: list.length })}
        </span>
      </div>
      <div className="col-tip">{t('Собери комплект целиком: за него титул с монетами и сияние вокруг героя. Сильнее комплект не делает, только красивее.')}</div>
      <div className="col-list">
        {sorted.map((c) => (
          <CollectionCard key={c.id} c={c} progress={progress} now={now} onAura={(id) => setProgress(setAura(progress, id))} />
        ))}
      </div>
    </Sheet>
  );
}
