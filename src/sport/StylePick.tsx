// Выбор стиля игры (один раз, потом — в настройках): «Приключение» с героями и сюжетом или строгий «Спорт».
import { Sheet } from '../Sheet';
import { setSetting, type Settings } from '../settings';
import { track } from '../telemetry';
import { t } from '../i18n';
import { Ring } from './SportStage';
import './sport.css';

export function pickStyle(style: Settings['style'], place: string): void {
  setSetting('style', style);
  setSetting('styleChosen', true);
  track('style_pick', `${style}:${place}`);
}

export function StylePick() {
  return (
    <Sheet onClose={() => pickStyle('adventure', 'close')} bodyClassName="style-pick">
      <h2>{t('Как тебе удобнее?')}</h2>
      <p className="muted">{t('Награды, уровни и рейтинг одинаковые — меняется только оформление. Поменять можно в настройках.')}</p>
      <button className="style-card adv" onClick={() => pickStyle('adventure', 'first')}>
        <span className="style-prev adv">
          <img src="/portraits/grom.png" alt="" />
        </span>
        <span className="style-text">
          <b>{t('Приключение')}</b>
          <small>{t('3D-герои, сюжет и боссы: каждый повтор — удар по врагу.')}</small>
        </span>
      </button>
      <button className="style-card sp" onClick={() => pickStyle('sport', 'first')}>
        <span className="style-prev sp">
          <Ring share={0.68} value={24} size={74} />
        </span>
        <span className="style-text">
          <b>{t('Спорт')}</b>
          <small>{t('Строго и по делу: счётчик, таймер, темп и цель. Без сказки.')}</small>
        </span>
      </button>
    </Sheet>
  );
}

/** Переключатель стиля в настройках. */
export function StyleSwitch({ value }: { value: Settings['style'] }) {
  return (
    <div className="style-switch" role="radiogroup" aria-label={t('Стиль игры')}>
      {(['adventure', 'sport'] as const).map((s) => (
        <button key={s} role="radio" aria-checked={value === s} className={value === s ? 'on' : ''} onClick={() => pickStyle(s, 'settings')}>
          {s === 'adventure' ? t('Приключение') : t('Спорт')}
        </button>
      ))}
    </div>
  );
}
