import { useEffect } from 'react';
import { Sheet } from '../Sheet';
import { track } from '../telemetry';
import { Portrait } from './Dialog';
import { NPCS } from './npcs';
import { type Feature, UNLOCK_AT } from './unlocks';
import { t } from '../i18n';

const GROM = { face: 'grom', color: NPCS.grom.color, who: NPCS.grom.name };

/** Название и одна строка про раздел: для объявления Грома и подсказки на закрытой кнопке. */
export const FEATURE_INFO: Record<Feature, { title: string; text: string }> = {
  daily: { title: t('Задание дня'), text: t('Каждый день кто-то из жителей просит о помощи: сделай упражнение и получи монеты.') },
  shop: { title: t('Лавка Фёдора'), text: t('Оружие, щиты и зелья за монеты: сильнее удар — быстрее победа.') },
  programs: { title: t('Программы Грома'), text: t('Планы тренировок на несколько недель: Гром ведёт тебя день за днём.') },
  gym: { title: t('Зал'), text: t('Дневник тренировок с весами, если ходишь в зал.') },
  duel: { title: t('Дуэли и друзья'), text: t('Бой с живым соперником: кто больше повторов за минуту. Можно вызвать друга.') },
  pass: { title: t('Пропуск сезона'), text: t('Задания на день и неделю и 30 ступеней наград.') },
  events: { title: t('События'), text: t('Босс выходных раз в месяц, праздники и Титан, которого бьёт вся страна.') },
  collections: { title: t('Коллекции'), text: t('Собирай облики героя в наборы и получай титулы.') },
  dungeon: { title: t('Подземелье'), text: t('Головоломка «три в ряд»: каждый повтор даёт заряд, а этажи приносят дерево, камень и золото.') },
  village: { title: t('Деревня'), text: t('Строй свою деревню на добычу из подземелья и защищай её от набегов.') },
  clan: { title: t('Клан'), text: t('Тренируйтесь вместе: чат, рейд-босс по выходным и войны кланов.') },
  city: { title: t('Битва городов'), text: t('Твои повторы за неделю идут в зачёт твоего города.') },
};

/** Подсказка на закрытой кнопке. */
export const lockedText = (f: Feature, left: number) => t('{0} откроется после уровня карты {1}: осталось {2} ур.', { 0: FEATURE_INFO[f].title, 1: UNLOCK_AT[f], 2: left });

/** Объявление Мастера Грома: открылись новые разделы. */
export function UnlockSheet({ features, onOpen, onClose }: { features: Feature[]; onOpen: (f: Feature) => void; onClose: () => void }) {
  // Ведём в самый «крупный» из открытых разделов: он последний в списке ступеней.
  const main = features[features.length - 1];
  // Статистика: сколько игроков доходят до каждого раздела.
  useEffect(() => {
    for (const f of features) track('unlock', f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Sheet onClose={onClose}>
      <div className="unlock">
        <Portrait line={GROM} size={64} />
        <div className="level-title">{features.length > 1 ? t('Открыты новые разделы!') : t('Открыт новый раздел!')}</div>
        <div className="muted">{t('Ты прошёл {0} ур. карты — пора расширять владения.', { 0: UNLOCK_AT[main] })}</div>
        <div className="unlock-list">
          {features.map((f) => (
            <div key={f} className="unlock-item">
              <b>{FEATURE_INFO[f].title}</b>
              <span>{FEATURE_INFO[f].text}</span>
            </div>
          ))}
        </div>
        <button className="primary" onClick={() => onOpen(main)}>
          {t('Посмотреть: {0}', { 0: FEATURE_INFO[main].title })}
        </button>
        <button className="link" onClick={onClose}>
          {t('Позже')}
        </button>
      </div>
    </Sheet>
  );
}
