// Вкладка «Война» экрана клана: два знамени, счёт, лучшие бойцы, награды и история войн.
import { useEffect, useState } from 'react';
import type { ClanView } from '../../shared/clan';
import { WAR_MIN_POINTS, WAR_MVP, WAR_REPS_PER_DAY, WAR_REWARDS, warReward, type WarResult, type WarSideView, type WarView } from '../../shared/war';
import { Chest, Coin, Flask, Swords } from '../icons';
import type { Progress } from '../game/progress';
import { Flag } from './Flag';
import './war.css';
import { locale, t } from '../i18n';

const num = (n: number) => n.toLocaleString(locale());
const fmtLeft = (ms: number) => {
  const h = Math.max(0, Math.floor(ms / 3600_000));
  return h >= 24 ? t('{0} д {1} ч', { 0: Math.floor(h / 24), 1: h % 24 }) : h >= 1 ? t('{0} ч {1} мин', { 0: h, 1: Math.floor((ms % 3600_000) / 60000) }) : t('{0} мин', { 0: Math.max(1, Math.ceil(ms / 60000)) });
};
const RESULT: Record<WarResult, string> = { win: t('Победа'), lose: t('Поражение'), draw: t('Ничья') };
const dateRu = (key: string) => new Date(`${key}T12:00:00+03:00`).toLocaleDateString('ru', { day: 'numeric', month: 'long' });

interface Props {
  clan: ClanView;
  // Уровень своего клана: для знамени до жеребьёвки.
  level: number;
  progress: Progress;
  onToggle: (on: boolean) => void;
  onClaim: (war: WarView) => void;
}

export function WarTab({ clan, level, progress, onToggle, onClaim }: Props) {
  const war = clan.war;
  // Часы на экране: время до конца и очки призрака идут сами.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tm = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tm);
  }, []);
  if (!war) return <div className="muted">{t('Войны кланов скоро откроются.')}</div>;
  const canToggle = clan.myRole !== 'member';
  const reward = war.reward && warReward(war.reward.result, war.reward.points, war.reward.mvp);
  // Забрана на этом телефоне или сервер уже выдал её (на другом).
  const claimed = war.reward && (war.reward.claimed || progress.warClaimed?.includes(war.reward.key));

  return (
    <>
      <div className={`war-card ${war.phase} ${war.result ?? ''}`}>
        <div className="war-when">{when(war, now)}</div>
        <div className="war-vs">
          <Side side={war.us ?? { id: clan.id, name: clan.name, tag: clan.tag, flag: clan.flag, level, members: clan.members.length, score: 0, top: [] }} level={war.us?.level ?? level} />
          <div className="war-mid">
            {war.us && war.them ? (
              <div className="war-score">
                <b className="us">{num(war.us.score)}</b>
                <span>:</span>
                <b className="them">{num(war.them.score)}</b>
              </div>
            ) : (
              <Swords size={28} />
            )}
          </div>
          {war.them ? (
            <Side side={war.them} level={war.them.level} ghost={war.ghost} />
          ) : (
            <div className="war-side">
              <div className="war-unknown">?</div>
              <div className="war-side-name muted">{t('Соперник')}</div>
            </div>
          )}
        </div>
        {war.us && war.them && <Tug us={war.us.score} them={war.them.score} />}
        <div className="war-note">
          {war.phase === 'signup'
            ? signupText(war, now)
            : war.ghost
              ? t('Настоящего соперника на эти выходные не нашлось — против вас {0}, ровно {1} бойцов. Обгоните их!', { 0: war.them?.name, 1: war.counted })
              : t('В зачёт идут {0} лучших с каждой стороны: больше людей — не значит больше очков.', { 0: war.counted })}
        </div>
      </div>

      {war.phase === 'ended' && war.result && (
        <div className={`war-result ${war.result}`}>
          {war.result === 'win' ? t('🏆 Победа!') : war.result === 'draw' ? t('🤝 Ничья') : t('🛡 Поражение')}
          <span className="muted"> {war.result === 'lose' ? t('Утешительные награды — всем, кто бился') : t('Награды — всем, кто бился')}</span>
        </div>
      )}

      {war.reward && !claimed && reward && (
        <div className="claim-card">
          <div>
            <div className="claim-title">{war.reward.mvp ? t('Ты MVP войны! Твоя награда') : t('Война окончена. Твоя награда')}</div>
            <div className="muted">
              {t('{0} повторов · {1} монет', { 0: num(war.reward.points), 1: num(reward.coins) })}{reward.chest ? t(' и сундук') : ''}
            </div>
          </div>
          <button className="small-btn" onClick={() => onClaim(war)}>
            {t('Забрать')}
          </button>
        </div>
      )}
      {war.reward && !reward && war.reward.points > 0 && <div className="muted war-small">{t('Для награды нужно сделать хотя бы {0} повторов за войну.', { 0: WAR_MIN_POINTS })}</div>}

      {war.phase === 'active' && (
        <div className="my-raid">
          <div>
            <div className="my-raid-dmg">
              <Swords size={15} /> {num(war.myPoints)} {war.outsider ? '' : t('очков')}
            </div>
            <div className="muted">{war.outsider ? t('Ты вступил после жеребьёвки: в этой войне очки не идут. Следующая — твоя!') : t('Сегодня {0} из {1}. Повторы в любом режиме — очки клану', { 0: num(war.myToday), 1: WAR_REPS_PER_DAY })}</div>
          </div>
          {!war.outsider && (
            <span className="war-day">
              <span style={{ width: `${Math.min(100, (100 * war.myToday) / WAR_REPS_PER_DAY)}%` }} />
            </span>
          )}
        </div>
      )}

      {war.us && war.them && (war.us.top.length > 0 || war.them.top.length > 0) && (
        <>
          <div className="section-title">{t('Лучшие бойцы')}</div>
          <div className="war-tops">
            <Top side={war.us} cls="us" />
            <Top side={war.them} cls="them" />
          </div>
        </>
      )}

      <div className="section-title">{t('Награды войны')}</div>
      <div className="tiers">
        {(['win', 'draw', 'lose'] as WarResult[]).map((r) => (
          <div key={r} className={`tier ${war.result === r ? 'on' : ''}`}>
            <span className={`tier-badge ${r === 'win' ? 'gold' : r === 'draw' ? 'silver' : 'part'}`}>{RESULT[r]}</span>
            <span className="tier-need">{r === 'win' ? t('всем, кто бился') : r === 'draw' ? t('поровну очков') : t('утешение')}</span>
            <Gift r={WAR_REWARDS[r]} />
          </div>
        ))}
        <div className="tier">
          <span className="tier-badge bronze">MVP</span>
          <span className="tier-need">{t('лучший в клане')}</span>
          <Gift r={WAR_MVP} plus />
        </div>
        <div className="muted tiers-note">
          {t('Клану за победу — 600 опыта, за ничью — 300, за поражение — 150. Награду получают все, кто сделал хотя бы {0} повторов. В день от каждого засчитываем до {1}.', { 0: WAR_MIN_POINTS, 1: WAR_REPS_PER_DAY })}
        </div>
      </div>

      <div className="section-title">
        {t('История войн')}
        <span className="war-record">
          <b className="w">{war.record.w}</b> {t('побед ·')} <b className="l">{war.record.l}</b> {t('пор. ·')} <b>{war.record.d}</b> {t('нич.')}
        </span>
      </div>
      {war.history.length === 0 ? (
        <div className="muted war-small">{t('Ещё ни одной войны. Первая — в эти выходные!')}</div>
      ) : (
        <div className="war-history">
          {war.history.map((h) => (
            <div key={h.key} className="war-hist">
              <Flag flag={h.opp.flag} tag={h.opp.tag} level={h.opp.level} size={30} />
              <div className="war-hist-body">
                <div className="war-hist-name">{h.opp.name}</div>
                <div className="muted">
                  {dateRu(h.key)}
                  {h.mvp && ` · MVP ${h.mvp}`}
                </div>
              </div>
              <div className="war-hist-score">
                {num(h.us)} : {num(h.them)}
              </div>
              <span className={`war-badge ${h.result}`}>{RESULT[h.result]}</span>
            </div>
          ))}
        </div>
      )}

      {canToggle ? (
        <label className="toggle-row">
          <div>
            <div className="toggle-title">{t('Участвовать в войнах')}</div>
            <div className="muted">{t('Каждую пятницу в 19:00 по Москве клан получит соперника похожего размера и уровня. Нужно от 3 участников.')}</div>
          </div>
          <input type="checkbox" className="switch" checked={war.enabled} onChange={(e) => onToggle(e.target.checked)} />
        </label>
      ) : (
        <div className="muted war-small">{war.enabled ? t('Клан записан на войны.') : t('Клан не участвует в войнах: записать его может глава или заместитель.')}</div>
      )}
    </>
  );
}

function when(war: WarView, now: number): string {
  if (war.phase === 'active') return t('До конца {0}', { 0: fmtLeft(war.end - now) });
  if (war.phase === 'paired') return t('Бой через {0}', { 0: fmtLeft(war.start - now) });
  if (war.phase === 'ended') return t('Война окончена');
  return now < war.pairAt ? t('Жеребьёвка через {0}', { 0: fmtLeft(war.pairAt - now) }) : t('Запись на следующие выходные');
}

function signupText(war: WarView, now: number): string {
  if (now >= war.pairAt) return t('Пары на эти выходные уже составлены. Запишитесь — и в следующую пятницу клан получит соперника.');
  return war.enabled ? t('Клан записан! Соперника похожего размера и уровня назовём в пятницу в 19:00 по Москве.') : t('Клан не записан на войны. Война идёт по выходным: побеждает тот, кто сделает больше повторов.');
}

function Side({ side, level, ghost }: { side: WarSideView; level?: number; ghost?: boolean }) {
  return (
    <div className={`war-side ${ghost ? 'ghost' : ''}`}>
      <Flag flag={side.flag} tag={side.tag} level={level || 1} size={62} />
      <div className="war-side-name">{side.name}</div>
      <div className="muted">
        {ghost ? t('призрачный клан') : t('{0} ур.', { 0: side.level })} · {t('{0} бойц.', { 0: side.members })}
      </div>
    </div>
  );
}

function Tug({ us, them }: { us: number; them: number }) {
  const share = us + them > 0 ? us / (us + them) : 0.5;
  return (
    <div className="war-tug">
      <span className="us" style={{ width: `${share * 100}%` }} />
      <span className="them" />
    </div>
  );
}

function Top({ side, cls }: { side: WarSideView; cls: string }) {
  return (
    <div className={`war-top ${cls}`}>
      <div className="war-top-head">{side.name}</div>
      {side.top.length === 0 && <div className="muted war-small">{t('Пока без очков')}</div>}
      {side.top.map((tm, i) => (
        <div key={i} className={`war-top-row ${tm.me ? 'me' : ''}`}>
          <span className="top-place">{i === 0 ? '★' : i + 1}</span>
          <span className={`war-top-name ${tm.pro ? 'pro-name' : ''}`}>{tm.name}</span>
          <b>{num(tm.points)}</b>
        </div>
      ))}
    </div>
  );
}

function Gift({ r, plus }: { r: { coins: number; potions: { vigor?: number; might?: number }; chest: boolean }; plus?: boolean }) {
  return (
    <span className="tier-gift">
      {plus && '+'}
      <Coin size={12} className="coin" /> {r.coins}
      {Object.entries(r.potions).map(([id, n]) => (
        <span key={id} className="tier-potion">
          <Flask size={16} color={id === 'vigor' ? '#ff6b81' : '#ffb46b'} />×{n}
        </span>
      ))}
      {r.chest && (
        <span className="tier-potion">
          <Chest size={15} />
        </span>
      )}
    </span>
  );
}
