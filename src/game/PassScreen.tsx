import { useEffect, useRef, useState } from 'react';
import { Check, Chest, Coin, Flask, Lock, PassShield, Star, Swords } from '../icons';
import { gearIcon, itemById, potionById } from './items';
import { portraitUrl } from './npcs';
import { claimPassTier, claimQuest, PASS_TIERS, questXp, passEndsAt, passQuests, passWeekEndsAt, passRewards, passTier, type PassReward, type Quest, questValue, rewardLabel, type Track } from './pass';
import { passOf, Progress } from './progress';
import { sfx } from '../audio';
import { useProOffer } from '../cloud';
import { payStars } from '../payments';
import { openPassInTelegram, platform } from '../telegram';

// Пропуск сезона: два щита — серый бесплатный и золотой Pro, ступени наград и задания.

const fmtLeft = (ms: number) => {
  const h = Math.max(0, Math.floor(ms / 3600_000));
  return h >= 24 ? `${Math.floor(h / 24)} д ${h % 24} ч` : h >= 1 ? `${h} ч ${Math.floor((ms % 3600_000) / 60000)} мин` : `${Math.max(1, Math.ceil(ms / 60000))} мин`;
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
  const t = passTier(pass.xp);
  const quests = passQuests(progress, now);
  const readyQuests = quests.filter((q) => !pass.quests.includes(q.id) && questValue(progress, q, now) >= q.target).length;
  const [tab, setTab] = useState<'rewards' | 'quests'>(readyQuests ? 'quests' : 'rewards');
  const [toast, setToast] = useState<string | null>(null);
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
    show(`Ступень ${tier}: ${r.label}!`);
  };
  const claim = (q: Quest) => {
    const next = claimQuest(progress, q, Date.now(), pro);
    if (!next) return;
    const before = t.tier;
    setProgress(next);
    const after = passTier(passOf(next, Date.now()).xp).tier;
    sfx(after > before ? 'levelup' : 'coin');
    show(after > before ? `Новая ступень щита: ${after}!` : `+${questXp(q, pro)} опыта пропуска${pro ? ' (с бонусом Pro)' : ''}`);
  };

  return (
    <div className="pass-screen">
      <div className="pass-top">
        <button className="pill btn icon-only" onClick={onClose} aria-label="Назад">
          ‹
        </button>
        <div className="pass-heading">
          <div className="pass-name">Пропуск сезона {pass.season}</div>
          <div className="pass-left">до конца сезона {fmtLeft(passEndsAt(now) - now)}</div>
        </div>
      </div>

      <div className="pass-hero">
        <div className="pass-shields">
          <div className="pass-badge">
            <PassShield size={64} label={t.tier} />
            <span>Бесплатный</span>
          </div>
          <div className={`pass-badge gold ${pro ? 'on' : ''}`}>
            <span className="pass-glow" />
            <PassShield size={78} gold star={!pro} label={pro ? t.tier : undefined} />
            <span className={pro ? 'pro-name' : ''}>Pro Pass</span>
          </div>
        </div>
        <div className="pass-xp">
          <div className="pass-xp-row">
            <b>{t.tier >= PASS_TIERS ? 'Все ступени открыты' : `Ступень ${t.tier} → ${t.tier + 1}`}</b>
            <span>
              {t.into} / {t.need} опыта
            </span>
          </div>
          <div className="pass-bar">
            <div style={{ width: `${(t.into / t.need) * 100}%` }} />
          </div>
        </div>
        <ProBuy pro={pro} now={now} onPaid={(text) => (sfx('chest'), show(text))} />
      </div>

      <div className="tabs">
        <button className={tab === 'rewards' ? 'active' : ''} onClick={() => setTab('rewards')}>
          Награды
        </button>
        <button className={tab === 'quests' ? 'active' : ''} onClick={() => setTab('quests')}>
          Задания{readyQuests > 0 && <span className="tab-dot">{readyQuests}</span>}
        </button>
      </div>

      {tab === 'rewards' ? (
        <div className="pass-track">
          <div className="pass-track-head">
            <span>Серый щит</span>
            <span />
            <span className="gold-text">Золотой щит</span>
          </div>
          {Array.from({ length: PASS_TIERS }, (_, i) => i + 1).map((tier) => {
            const r = passRewards(tier);
            const open = tier <= t.tier;
            return (
              <div key={tier} ref={tier === Math.min(PASS_TIERS, t.tier + 1) ? current : undefined} className={`pass-row ${open ? 'open' : ''} ${tier === t.tier + 1 ? 'next' : ''}`}>
                <RewardCard reward={r.free} state={pass.free.includes(tier) ? 'got' : open ? 'ready' : 'locked'} onClaim={() => claimTier('free', tier)} />
                <div className="pass-node">
                  <PassShield size={30} gold={open} dim={!open} label={tier} />
                </div>
                <RewardCard reward={r.pro} gold state={pass.pro.includes(tier) ? 'got' : !pro ? 'pro' : open ? 'ready' : 'locked'} onClaim={() => claimTier('pro', tier)} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="pass-quests">
          <QuestGroup title="Задания дня" note={`обновятся через ${fmtLeft(untilMidnight(now))}`} quests={quests.filter((q) => q.kind === 'daily')} progress={progress} now={now} claimed={pass.quests} pro={pro} onClaim={claim} />
          <QuestGroup title="Задания недели" note={`обновятся через ${fmtLeft(passWeekEndsAt(now) - now)}`} quests={quests.filter((q) => q.kind === 'weekly')} progress={progress} now={now} claimed={pass.quests} pro={pro} onClaim={claim} />
          <QuestGroup title="Задания сезона" note={`до конца сезона ${fmtLeft(passEndsAt(now) - now)}`} quests={quests.filter((q) => q.kind === 'season')} progress={progress} now={now} claimed={pass.quests} pro={pro} onClaim={claim} />
        </div>
      )}
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
      return (
        <span className="pass-outfit" style={{ background: `radial-gradient(circle at 50% 35%, ${item.color}, #1b1d26 80%)`, boxShadow: item.glow ? `0 0 12px ${item.glow}` : undefined }}>
          <img src={portraitUrl('hero')} alt="" draggable={false} />
        </span>
      );
    }
  }
}

const DAY = 86_400_000;
const fmtDay = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

/** Pro Pass за звёзды Telegram: покупка в Telegram, в Max и браузере — ссылка в бота. Pro действует по аккаунту везде. */
// Что даёт Pro: кратко — под активным Pro, списком — у кнопки покупки.
const PRO_PERKS = 'золотые награды, заморозка серии, +25% опыта пропуска';
const PRO_PERK_LIST = [
  '❄️ Заморозка серии раз в неделю: пропуск не обнулит серию',
  '⚡ +25% опыта за задания пропуска',
  '🏆 Золотая дорожка наград и облик «Страж Золотого щита»',
  '✨ Золотое имя в клане, чате и рейтинге',
  '🎁 3 дня Pro в подарок другу — раз в сезон',
];

function ProBuy({ pro, now, onPaid }: { pro: boolean; now: number; onPaid: (text: string) => void }) {
  const offer = useProOffer();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const price = offer?.price;
  const late = passEndsAt(now) - now < 7 * DAY;
  const buy = async () => {
    if (platform !== 'tg') return openPassInTelegram();
    setBusy(true);
    setNote(null);
    const before = offer?.until ?? 0;
    let until = 0;
    const r = await payStars('pro', (s) => s.pro && (until = s.proOffer?.until ?? 0) > before);
    setBusy(false);
    if (r === 'done') onPaid(`Pro Pass активен до ${fmtDay(until)}!`);
    else if (r === 'late') setNote('Оплата прошла, Pro включится через минуту. Если нет — напиши боту /paysupport.');
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
          <span className="pro-name">Pro Pass активен</span>
          {offer?.until ? ` до ${fmtDay(offer.until)}` : ''} · {PRO_PERKS}
        </div>
        {offer?.trial?.canGive && <div className="pass-buy-note">🎁 Подари другу 3 дня Pro бесплатно: «Друзья» → нажми на друга. Один подарок в сезон.</div>}
        {offer?.until && offer.canBuy && late && (
          <button className="pass-buy ghost" disabled={busy} onClick={buy}>
            Продлить на следующий сезон {cost}
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
            <span className="pro-name">Пробный Pro</span> до {fmtDay(offer!.trial!.until!)}. Понравилось? Оставь Pro на весь сезон.
          </>
        ) : (
          <b>Pro Pass на сезон</b>
        )}
        <ul className="pass-perks">
          {PRO_PERK_LIST.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        Силы в дуэлях не прибавляет: там решают только твои повторы.
      </div>
      <button className="pass-buy primary" disabled={busy} onClick={buy}>
        {platform === 'tg' ? 'Купить Pro' : 'Купить в Telegram'} {cost}
      </button>
      <div className="pass-buy-note">
        {note ??
          (platform === 'tg'
            ? late
              ? 'До конца сезона меньше недели: покупка сразу включает и следующий сезон.'
              : 'Награды всех уже пройденных ступеней можно забрать сразу.'
            : 'Оплата звёздами в Telegram. Pro будет работать и здесь, если этот вход привязан к тому же герою.')}
      </div>
    </div>
  );
}

function RewardCard({ reward, gold = false, state, onClaim }: { reward: PassReward; gold?: boolean; state: 'got' | 'ready' | 'locked' | 'pro'; onClaim: () => void }) {
  return (
    <button className={`pass-reward ${gold ? 'gold' : ''} ${state}`} disabled={state !== 'ready'} onClick={onClaim}>
      <span className="pass-reward-icon">
        <RewardIcon reward={reward} />
      </span>
      <span className="pass-reward-name">{rewardLabel(reward)}</span>
      <span className="pass-reward-state">
        {state === 'got' ? (
          <>
            <Check size={12} /> получено
          </>
        ) : state === 'ready' ? (
          'Забрать'
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
