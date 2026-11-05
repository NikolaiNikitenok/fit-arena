import { useEffect, useRef, useState } from 'react';
import { Check, Chest, Coin, Flask, Lock, PassShield, Star, Swords } from '../icons';
import { gearById, gearIcon, gearText, itemById, potionById, RARITY_COLORS, RARITY_NAMES } from './items';
import { heroHands } from './power';
import { OutfitPreview } from './OutfitPreview';
import { Sheet } from '../Sheet';
import { HeroThumb } from '../village/TroopInfoSheet';
import { heroLook } from './outfitSkin';
import { claimPassTier, claimQuest, PASS_TIERS, questXp, passEndsAt, passQuests, passWeekEndsAt, passRewards, passTier, type PassReward, type Quest, questValue, rewardLabel, type Track } from './pass';
import { passOf, Progress } from './progress';
import { sfx } from '../audio';
import { useProOffer } from '../cloud';
import { offerSeen, payStars } from '../payments';
import { openPassInTelegram, platform } from '../telegram';
import { t, locale } from '../i18n';

// Пропуск сезона: два щита — серый бесплатный и золотой Pro, ступени наград и задания.

const fmtLeft = (ms: number) => {
  const h = Math.max(0, Math.floor(ms / 3600_000));
  return h >= 24 ? t('{0} д {1} ч', { 0: Math.floor(h / 24), 1: h % 24 }) : h >= 1 ? t('{0} ч {1} мин', { 0: h, 1: Math.floor((ms % 3600_000) / 60000) }) : t('{0} мин', { 0: Math.max(1, Math.ceil(ms / 60000)) });
};
const untilMidnight = (now: number) => {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime() - now;
};

interface Props {
  progress: Progress;
  setProgress: (p: Progress) => void;
  pro: boolean;
  land: number;
  onClose: () => void;
}

export function PassScreen({ progress, setProgress, pro, land, onClose }: Props) {
  const now = Date.now();
  const pass = passOf(progress, now);
  const tm = passTier(pass.xp);
  const quests = passQuests(progress, now);
  const readyQuests = quests.filter((q) => !pass.quests.includes(q.id) && questValue(progress, q, now) >= q.target).length;
  const [tab, setTab] = useState<'rewards' | 'quests'>(readyQuests ? 'quests' : 'rewards');
  const [toast, setToast] = useState<string | null>(null);
  // Обзор награды: ступень и дорожка.
  const [view, setView] = useState<{ tier: number; track: Track } | null>(null);
  const current = useRef<HTMLDivElement>(null);
  const show = (text: string) => {
    setToast(text);
    setTimeout(() => setToast((x) => (x === text ? null : x)), 2600);
  };
  useEffect(() => {
    if (tab === 'rewards') current.current?.scrollIntoView({ block: 'center' });
  }, [tab]);

  const claimTier = (track: Track, tier: number) => {
    const r = claimPassTier(progress, track, tier, pro, land, Date.now());
    if (!r) return;
    setProgress(r.progress);
    sfx(r.gear ? 'chest' : 'coin');
    show(t('Ступень {0}: {1}!', { 0: tier, 1: r.label }));
  };
  const claim = (q: Quest) => {
    const next = claimQuest(progress, q, Date.now(), pro);
    if (!next) return;
    const before = tm.tier;
    setProgress(next);
    const after = passTier(passOf(next, Date.now()).xp).tier;
    sfx(after > before ? 'levelup' : 'coin');
    show(after > before ? t('Новая ступень щита: {0}!', { 0: after }) : t('+{0} опыта пропуска{1}', { 0: questXp(q, pro), 1: pro ? t(' (с бонусом Pro)') : '' }));
  };

  return (
    <div className="pass-screen">
      <div className="pass-top">
        <button className="pill btn icon-only" onClick={onClose} aria-label={t('Назад')}>
          ‹
        </button>
        <div className="pass-heading">
          <div className="pass-name">{t('Пропуск сезона {0}', { 0: pass.season })}</div>
          <div className="pass-left">{t('до конца сезона {0}', { 0: fmtLeft(passEndsAt(now) - now) })}</div>
        </div>
      </div>

      <div className="pass-hero">
        <div className="pass-shields">
          <div className="pass-badge">
            <PassShield size={64} label={tm.tier} />
            <span>{t('Бесплатный')}</span>
          </div>
          <div className={`pass-badge gold ${pro ? 'on' : ''}`}>
            <span className="pass-glow" />
            <PassShield size={78} gold star={!pro} label={pro ? tm.tier : undefined} />
            <span className={pro ? 'pro-name' : ''}>Pro Pass</span>
          </div>
        </div>
        <div className="pass-xp">
          <div className="pass-xp-row">
            <b>{tm.tier >= PASS_TIERS ? t('Все ступени открыты') : t('Ступень {0} → {1}', { 0: tm.tier, 1: tm.tier + 1 })}</b>
            <span>
              {t('{0} / {1} опыта', { 0: tm.into, 1: tm.need })}
            </span>
          </div>
          <div className="pass-bar">
            <div style={{ width: `${(tm.into / tm.need) * 100}%` }} />
          </div>
        </div>
        <ProBuy pro={pro} now={now} onPaid={(text) => (sfx('chest'), show(text))} />
      </div>

      <div className="tabs">
        <button className={tab === 'rewards' ? 'active' : ''} onClick={() => setTab('rewards')}>
          {t('Награды')}
        </button>
        <button className={tab === 'quests' ? 'active' : ''} onClick={() => setTab('quests')}>
          {t('Задания')}{readyQuests > 0 && <span className="tab-dot">{readyQuests}</span>}
        </button>
      </div>

      {tab === 'rewards' ? (
        <div className="pass-track">
          <div className="pass-track-head">
            <span>{t('Серый щит')}</span>
            <span />
            <span className="gold-text">{t('Золотой щит')}</span>
          </div>
          {Array.from({ length: PASS_TIERS }, (_, i) => i + 1).map((tier) => {
            const r = passRewards(tier, pass.season);
            const open = tier <= tm.tier;
            return (
              <div key={tier} ref={tier === Math.min(PASS_TIERS, tm.tier + 1) ? current : undefined} className={`pass-row ${open ? 'open' : ''} ${tier === tm.tier + 1 ? 'next' : ''}`}>
                <RewardCard reward={r.free} state={pass.free.includes(tier) ? 'got' : open ? 'ready' : 'locked'} onClaim={() => claimTier('free', tier)} onOpen={() => setView({ tier, track: 'free' })} />
                <div className="pass-node">
                  <PassShield size={30} gold={open} dim={!open} label={tier} />
                </div>
                <RewardCard reward={r.pro} gold state={pass.pro.includes(tier) ? 'got' : !pro ? 'pro' : open ? 'ready' : 'locked'} onClaim={() => claimTier('pro', tier)} onOpen={() => setView({ tier, track: 'pro' })} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="pass-quests">
          <QuestGroup title={t('Задания дня')} note={t('обновятся через {0}', { 0: fmtLeft(untilMidnight(now)) })} quests={quests.filter((q) => q.kind === 'daily')} progress={progress} now={now} claimed={pass.quests} pro={pro} onClaim={claim} />
          <QuestGroup title={t('Задания недели')} note={t('обновятся через {0}', { 0: fmtLeft(passWeekEndsAt(now) - now) })} quests={quests.filter((q) => q.kind === 'weekly')} progress={progress} now={now} claimed={pass.quests} pro={pro} onClaim={claim} />
          <QuestGroup title={t('Задания сезона')} note={t('до конца сезона {0}', { 0: fmtLeft(passEndsAt(now) - now) })} quests={quests.filter((q) => q.kind === 'season')} progress={progress} now={now} claimed={pass.quests} pro={pro} onClaim={claim} />
        </div>
      )}
      {view &&
        (() => {
          const reward = passRewards(view.tier, pass.season)[view.track];
          const got = (view.track === 'free' ? pass.free : pass.pro).includes(view.tier);
          const state: RewardState = got ? 'got' : view.track === 'pro' && !pro ? 'pro' : view.tier <= tm.tier ? 'ready' : 'locked';
          return (
            <RewardSheet
              reward={reward}
              tier={view.tier}
              track={view.track}
              state={state}
              progress={progress}
              onClaim={() => {
                claimTier(view.track, view.tier);
                setView(null);
              }}
              onClose={() => setView(null)}
            />
          );
        })()}
      {toast && <div className="toast global">{toast}</div>}
    </div>
  );
}

function RewardIcon({ reward }: { reward: PassReward }) {
  switch (reward.kind) {
    case 'coins':
      return <Coin size={26} className="coin" />;
    case 'potion':
      return <Flask size={32} color={potionById(reward.id).color} scroll={reward.id === 'swap'} />;
    case 'chest':
      return <Chest size={32} />;
    case 'gear':
      return <Swords size={26} />;
    case 'passGear':
      return <img className="pass-gear-icon" src={gearIcon(reward.id)} alt="" draggable={false} />;
    case 'outfit': {
      const item = itemById(reward.id);
      // Сам облик в 3D, а не общий портрет героя.
      return (
        <span className="pass-outfit" style={{ background: `radial-gradient(circle at 50% 35%, ${item.color}, #1b1d26 80%)`, boxShadow: item.glow ? `0 0 12px ${item.glow}` : undefined }}>
          <HeroThumb look={heroLook(item)} size={46} />
        </span>
      );
    }
  }
}

const DAY = 86_400_000;
const fmtDay = (tm: number) => new Date(tm).toLocaleDateString(locale(), { day: 'numeric', month: 'long' });

/** Pro Pass за звёзды Telegram: покупка в Telegram, в Max и браузере — ссылка в бота. Pro действует по аккаунту везде. */
// Что даёт Pro: кратко — под активным Pro, списком — у кнопки покупки.
const PRO_PERKS = t('золотые награды, заморозка серии, +25% опыта пропуска');
const PRO_PERK_LIST = [
  t('❄️ Заморозка серии раз в неделю: пропуск не обнулит серию'),
  t('⚡ +25% опыта за задания пропуска'),
  t('🏆 Золотая дорожка наград и облик «Страж Золотого щита»'),
  t('✨ Золотое имя в клане, чате и рейтинге'),
  t('🎁 3 дня Pro в подарок другу — раз в сезон'),
];

function ProBuy({ pro, now, onPaid }: { pro: boolean; now: number; onPaid: (text: string) => void }) {
  const offer = useProOffer();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const price = offer?.price;
  const late = passEndsAt(now) - now < 7 * DAY;
  useEffect(() => {
    if (!pro && price) offerSeen('pro', 'pass');
  }, [pro, price]);
  const buy = async () => {
    if (platform !== 'tg') return openPassInTelegram();
    setBusy(true);
    setNote(null);
    const before = offer?.until ?? 0;
    let until = 0;
    const r = await payStars('pro', (s) => s.pro && (until = s.proOffer?.until ?? 0) > before, undefined, 'pass');
    setBusy(false);
    if (r === 'done') onPaid(t('Pro Pass активен до {0}!', { 0: fmtDay(until) }));
    else if (r === 'late') setNote(t('Оплата прошла, Pro включится через минуту. Если нет — напиши боту /paysupport.'));
    else if (r !== 'cancelled') setNote(r.error);
  };
  const cost = price ? (
    <span className="btn-cost">
      {price} <Star size={13} />
    </span>
  ) : null;
  // Пробный Pro от друга: свой Pro не оплачен, но три дня золото включено.
  const trialOnly = pro && !offer?.until && !!offer?.trial?.until;
  if (pro && !trialOnly)
    return (
      <div className="pass-pro-box">
        <div className="pass-pro-note">
          <span className="pro-name">{t('Pro Pass активен')}</span>
          {offer?.until ? t(' до {0}', { 0: fmtDay(offer.until) }) : ''} · {PRO_PERKS}
        </div>
        {offer?.trial?.canGive && <div className="pass-buy-note">{t('🎁 Подари другу 3 дня Pro бесплатно: «Друзья» → нажми на друга. Один подарок в сезон.')}</div>}
        {offer?.until && offer.canBuy && late && (
          <button className="pass-buy ghost" disabled={busy} onClick={buy}>
            {t('Продлить на следующий сезон')} {cost}
          </button>
        )}
        {note && <div className="pass-buy-note">{note}</div>}
      </div>
    );
  return (
    <div className="pass-pro-box">
      <div className="pass-pro-note">
        {trialOnly ? (
          <>
            <span className="pro-name">{t('Пробный Pro')}</span> {t('до {0}. Понравилось? Оставь Pro на весь сезон.', { 0: fmtDay(offer!.trial!.until!) })}
          </>
        ) : (
          <b>{t('Pro Pass на сезон')}</b>
        )}
        <ul className="pass-perks">
          {PRO_PERK_LIST.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {t('Силы в дуэлях не прибавляет: там решают только твои повторы.')}
      </div>
      <button className="pass-buy primary" disabled={busy} onClick={buy}>
        {platform === 'tg' ? t('Купить Pro') : t('Купить в Telegram')} {cost}
      </button>
      <div className="pass-buy-note">
        {note ??
          (platform === 'tg'
            ? late
              ? t('До конца сезона меньше недели: покупка сразу включает и следующий сезон.')
              : t('Награды всех уже пройденных ступеней можно забрать сразу.')
            : t('Оплата звёздами в Telegram. Pro будет работать и здесь, если этот вход привязан к тому же герою.'))}
      </div>
    </div>
  );
}

type RewardState = 'got' | 'ready' | 'locked' | 'pro';

// Облик и уникальное оружие стоит рассмотреть: по нажатию — обзор. Готовые монеты, зелья и сундуки забираются сразу.
const showcase = (r: PassReward) => r.kind === 'outfit' || r.kind === 'passGear';

function RewardCard({ reward, gold = false, state, onClaim, onOpen }: { reward: PassReward; gold?: boolean; state: RewardState; onClaim: () => void; onOpen: () => void }) {
  return (
    <button className={`pass-reward ${gold ? 'gold' : ''} ${state} ${showcase(reward) ? 'showcase' : ''}`} onClick={state === 'ready' && !showcase(reward) ? onClaim : onOpen}>
      <span className="pass-reward-icon">
        <RewardIcon reward={reward} />
      </span>
      <span className="pass-reward-name">{rewardLabel(reward)}</span>
      <span className="pass-reward-state">
        {state === 'got' ? (
          <>
            <Check size={12} /> {t('получено')}
          </>
        ) : state === 'ready' ? (
          t('Забрать')
        ) : state === 'pro' ? (
          <>
            <Lock size={11} /> Pro
          </>
        ) : (
          <Lock size={11} />
        )}
      </span>
    </button>
  );
}

/** Что даёт награда, без цифр, которые решаются при получении. */
function rewardText(r: PassReward): string {
  switch (r.kind) {
    case 'coins':
      return t('Монеты сразу в кошелёк.');
    case 'potion':
      return potionById(r.id).text;
    case 'chest':
      return t('Монеты и случайная вещь: облик, снаряжение или зелье. Чем дальше по карте, тем лучше добыча.');
    case 'gear':
      return t('Случайное оружие или щит для твоей земли — сильнее, чем в лавке рядом.');
    case 'passGear': {
      const g = gearById(r.id);
      return g ? t('Только в пропуске. {0}', { 0: gearText(g) }) : '';
    }
    case 'outfit':
      return '';
  }
}

function stateText(state: RewardState, tier: number): string {
  return state === 'got' ? t('Уже получено') : state === 'pro' ? t('Награда золотого щита: нужен Pro Pass') : state === 'locked' ? t('Откроется на ступени {0}', { 0: tier }) : '';
}

/** Обзор награды пропуска: облик — герой в нём на подставке, остальное — крупно с описанием. */
function RewardSheet({ reward, tier, track, state, progress, onClaim, onClose }: { reward: PassReward; tier: number; track: Track; state: RewardState; progress: Progress; onClaim: () => void; onClose: () => void }) {
  const where = t('{0} · ступень {1}', { 0: track === 'pro' ? t('Золотой щит') : t('Серый щит'), 1: tier });
  const action =
    state === 'ready' ? (
      <button className="primary op-btn" onClick={onClaim}>
        {t('Забрать')}
      </button>
    ) : (
      <div className="pass-sheet-state">
        {state === 'got' ? <Check size={14} /> : <Lock size={13} />} {stateText(state, tier)}
      </div>
    );
  if (reward.kind === 'outfit') {
    const item = itemById(reward.id);
    return <OutfitPreview item={item} hands={heroHands(progress)} owned={false} equipped={false} coins={0} onBuy={() => {}} onEquip={() => {}} onClose={onClose} note={where} action={action} />;
  }
  const g = reward.kind === 'passGear' ? gearById(reward.id) : undefined;
  return (
    <Sheet onClose={onClose} className="pass-sheet">
      <div className={`pass-sheet-icon ${track === 'pro' ? 'gold' : ''}`}>
        <RewardIcon reward={reward} />
      </div>
      <div className="op-name">{rewardLabel(reward)}</div>
      {g && <div className="op-meta" style={{ color: RARITY_COLORS[g.rarity] }}>{RARITY_NAMES[g.rarity]}</div>}
      <div className="op-note">{where}</div>
      <p className="pass-sheet-text">{rewardText(reward)}</p>
      {action}
    </Sheet>
  );
}

function QuestGroup({ title, note, quests, progress, now, claimed, pro, onClaim }: { title: string; note?: string; quests: Quest[]; progress: Progress; now: number; claimed: string[]; pro: boolean; onClaim: (q: Quest) => void }) {
  return (
    <>
      <div className="section-title">
        {title}
        {note && <span className="muted small-note">{note}</span>}
      </div>
      {quests.map((q) => {
        const v = Math.min(q.target, questValue(progress, q, now));
        const got = claimed.includes(q.id);
        const ready = !got && v >= q.target;
        return (
          <div key={q.id} className={`pass-quest ${got ? 'got' : ''} ${ready ? 'ready' : ''}`}>
            <div className="pass-quest-body">
              <div className="pass-quest-title">{q.title}</div>
              <div className="pass-quest-bar">
                <div style={{ width: `${(v / q.target) * 100}%` }} />
              </div>
              <div className="pass-quest-count">
                {v} / {q.target}
              </div>
            </div>
            {got ? (
              <span className="pass-quest-xp done">
                <Check size={14} />
              </span>
            ) : ready ? (
              <button className="small-btn pass-claim" onClick={() => onClaim(q)}>
                +{questXp(q, pro)}
              </button>
            ) : (
              <span className="pass-quest-xp">+{questXp(q, pro)}</span>
            )}
          </div>
        );
      })}
    </>
  );
}
