// Ярлык игры на главном экране телефона (Telegram, Bot API 8.0): строка в настройках и одно предложение после победы.
import { useEffect, useState } from 'react';
import { addToHomeScreen, homeScreenStatus, tg } from './telegram';
import { track } from './telemetry';
import { t } from './i18n';

type Status = Awaited<ReturnType<typeof homeScreenStatus>>;

function useHomeStatus(): [Status | null, () => void] {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let alive = true;
    void homeScreenStatus().then((s) => alive && setStatus(s));
    const added = () => setStatus('added');
    try {
      tg?.onEvent?.('homeScreenAdded', added);
    } catch {
      // Старый клиент.
    }
    return () => {
      alive = false;
    };
  }, []);
  const add = () => {
    track('home_shortcut', 'ask');
    addToHomeScreen();
  };
  return [status, add];
}

/** Настройки → «Об игре»: добавить ярлык или сказать, что он уже есть. */
export function HomeShortcutRow() {
  const [status, add] = useHomeStatus();
  if (status === 'added') return <div className="muted">{t('Ярлык игры уже на главном экране телефона.')}</div>;
  if (status !== 'missed' && status !== 'unknown') return null;
  return (
    <button className="secondary" onClick={add}>
      {t('📲 Ярлык на главный экран')}
    </button>
  );
}

const OFFER_KEY = 'fit-arena-home-offer';

/** После победы — один раз за всё время предлагаем ярлык, если его ещё нет. */
export function HomeShortcutOffer() {
  const [status, add] = useHomeStatus();
  const [show] = useState(() => {
    try {
      return !localStorage.getItem(OFFER_KEY);
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!show || status !== 'missed') return;
    try {
      localStorage.setItem(OFFER_KEY, '1');
    } catch {
      // Без хранилища покажем ещё раз — не страшно.
    }
  }, [show, status]);
  if (!show || status !== 'missed') return null;
  return (
    <div className="home-offer">
      <span>{t('Открывай игру в один тап — прямо с главного экрана телефона.')}</span>
      <button className="secondary" onClick={add}>
        {t('📲 Добавить ярлык')}
      </button>
    </div>
  );
}
