import { useEffect, useState } from 'react';
import { onPowerToast } from './devicePerf';
import { t } from './i18n';

/** Короткое сообщение, что игра сама включила экономный режим на слабом телефоне. */
export function PowerToast() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let timer = 0;
    const off = onPowerToast(() => {
      setShown(true);
      clearTimeout(timer);
      timer = window.setTimeout(() => setShown(false), 4500);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);
  if (!shown) return null;
  return (
    <div className="toast global power-toast">
      {t('Включили экономный режим — так игра идёт плавнее')}
      <small>{t('Выключить можно в настройках')}</small>
    </div>
  );
}
