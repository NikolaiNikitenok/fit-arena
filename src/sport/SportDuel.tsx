// Стиль «Спорт» для дуэлей: вместо арены с героями — два счёта повторов, полоса «кто впереди» и здоровье.
import type { FighterView } from '../../shared/protocol';
import { t } from '../i18n';
import './sport.css';
import './fx.css';
import { Gas } from './SportStage';
import { Sparks } from './fx';
import { useSettings } from '../settings';

export function SportDuel({ me, opponent, seconds }: { me: FighterView; opponent: FighterView; seconds: number }) {
  const total = me.hits + opponent.hits;
  const lead = total ? me.hits / total : 0.5;
  const diff = me.hits - opponent.hits;
  const calm = useSettings().lowPower;
  return (
    <div className="sp-duel">
      <Gas calm={calm} />
      {!calm && <Sparks burst={me.hits} x={25} y={45} count={12} />}
      {!calm && <Sparks burst={opponent.hits} x={75} y={45} count={8} hue={215} />}
      <div className="sp-top">
        <span className="sp-clock">{seconds}</span>
      </div>
      <div className="sp-duel-row">
        <div className={`sp-side me ${diff > 0 ? 'lead' : ''}`}>
          <span className={me.pro ? 'pro-name' : ''}>{me.name}</span>
          <b key={me.hits} className="sp-pop">{me.hits}</b>
        </div>
        <div className="sp-vs">{t('против')}</div>
        <div className={`sp-side rival ${diff < 0 ? 'lead' : ''}`}>
          <span className={opponent.pro ? 'pro-name' : ''}>{opponent.name}</span>
          <b key={opponent.hits} className="sp-pop">{opponent.hits}</b>
        </div>
      </div>
      <div className="sp-lead" aria-hidden>
        <span style={{ width: `${lead * 100}%` }} />
      </div>
      <div className="sp-note">{diff > 0 ? t('Ты впереди на {0}', { 0: diff }) : diff < 0 ? t('Отстаёшь на {0}', { 0: -diff }) : t('Поровну')}</div>
      <div className="sp-hp">
        {[me, opponent].map((f, i) => (
          <div key={i}>
            <span>{t('Запас сил')}</span>
            <div className="sp-hp-track">
              <span style={{ width: `${(f.hp / Math.max(1, f.maxHp)) * 100}%`, background: i ? 'var(--sp-rival)' : 'var(--sp-accent)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
