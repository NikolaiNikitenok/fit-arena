import { useEffect, useRef, useState } from 'react';
import { track } from '../telemetry';
import { CHAT_MAX, clanPlace, COUNTRIES, defaultFlag, parseFlag, type ClanMemberView, type ClanSettings, type ClanView } from '../../shared/clan';
import { CLAN_MAX_LEVEL, CLAN_REPS_PER_DAY, clanGift, clanLevel, clanPerks, clanUnlocks } from '../../shared/clanLevel';
import { fairShare, RAID_TIERS, raidBoss, raidReward, raidTier } from '../../shared/raid';
import { claimClanGiftRange, claimRaid, claimWar, recordActivity, recordRaidAttack, clanGiftsDue, clearClanPending, heroLevel, heroXp, Progress, syncClanGift } from '../game/progress';
import { Banner, Coin, Flask, Lock, Send, Swords } from '../icons';
import { EXERCISE_LABELS, Exercise } from '../repCounter';
import { clanInviteCode, clanInviteLink, platform, share } from '../telegram';
import { WebLoginButtons } from '../account/WebLogin';
import { RaidFight, RaidScene } from './RaidFight';
import { Flag, FlagPicker } from './Flag';
import { useClan } from './useClan';
import { WarTab } from './War';
import { warReward } from '../../shared/war';
import { sfx } from '../audio';
import { BAD_NAME, badName, hasProfanity } from '../../shared/profanity';
import { muteText } from '../../shared/moderation';
import { PlayerMenu, type PlayerMenuTarget } from '../moderation/PlayerMenu';
import { Sheet } from '../Sheet';
import { syncClanFlag } from '../village/decor';
import { locale, t, tMsg } from '../i18n';

const EXERCISES: Exercise[] = ['squat', 'pushup', 'situp'];
const ROLE: Record<ClanMemberView['role'], string> = { leader: t('глава'), officer: t('заместитель'), member: '' };

const fmtLeft = (ms: number) => {
  const h = Math.max(0, Math.floor(ms / 3600_000));
  return h >= 24 ? t('{0} д {1} ч', { 0: Math.floor(h / 24), 1: h % 24 }) : h >= 1 ? t('{0} ч {1} мин', { 0: h, 1: Math.floor((ms % 3600_000) / 60000) }) : t('{0} мин', { 0: Math.max(1, Math.ceil(ms / 60000)) });
};
const num = (n: number) => n.toLocaleString(locale());

// Цвет имени в чате: у каждого свой.
const nameColor = (name: string) => `hsl(${[...name].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7) % 360} 70% 62%)`;

interface Props {
  progress: Progress;
  setProgress: (p: Progress) => void;
  // Во время атаки на босса нижнее меню прячется.
  onPlaying: (playing: boolean) => void;
  landNow: number;
  onSpendMight: () => void;
}

export function ClanScreen({ progress, setProgress, onPlaying, landNow, onSpendMight }: Props) {
  const level = heroLevel(heroXp(progress)).level;
  const api = useClan(level);
  const { clan, status, error, send } = api;
  const [tab, setTab] = useState<'raid' | 'war' | 'chat' | 'members'>('raid');
  const [exercise, setExercise] = useState<Exercise>('squat');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const invite = useRef(clanInviteCode());

  // Пришли по ссылке-приглашению: вступаем, как только есть связь.
  useEffect(() => {
    if (status === 'online' && clan === null && invite.current) {
      send({ type: 'clanJoin', code: invite.current });
      invite.current = null;
    }
  }, [status, clan]);

  // Нижнее меню прячем только когда сервер разрешил атаку.
  useEffect(() => {
    onPlaying(!!api.attack);
    if (api.attack) onSpendMight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.attack]);

  // Повторы из приключения уходят клану; без клана копить их незачем.
  const pending = progress.clanPending ?? 0;
  useEffect(() => {
    if (status !== 'online' || clan === undefined || pending <= 0) return;
    if (clan) send({ type: 'clanReps', reps: Math.min(pending, CLAN_REPS_PER_DAY), since: progress.clanPendingAt });
    setProgress(clearClanPending(progress));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, clan?.id, pending]);

  // В новом клане подарки считаем с его текущего уровня.
  const cl = clan ? clanLevel(clan.xp) : null;
  useEffect(() => {
    if (!clan || !cl) return;
    const next = syncClanGift(progress, clan.id, cl.level);
    if (next) setProgress(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clan?.id, cl?.level]);

  // Флаг клана запоминается для знамён в деревне; вышел из клана — знамёна пропадут.
  const clanFlag = clan === undefined ? undefined : clan ? (parseFlag(clan.flag) ? clan.flag : defaultFlag(clan.tag)) : null;
  useEffect(() => {
    if (clanFlag === undefined) return;
    const next = syncClanFlag(progress, clanFlag);
    if (next) setProgress(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clanFlag]);

  const show = (tm: string) => {
    setToast(tm);
    setTimeout(() => setToast((x) => (x === tm ? null : tm)), 3000);
  };

  // Сервер проверил право на награду и отметил её выданной: только теперь начисляем монеты и вещи.
  useEffect(() => {
    const c = api.claimed;
    if (!c) return;
    api.setClaimed(null);
    if (c.kind === 'gift') {
      const next = claimClanGiftRange(progress, c.clan, c.from, c.to);
      if (!next) return;
      setProgress(next);
      show(t('+{0} монет!', { 0: next.coins - progress.coins }));
      return;
    }
    const reward = c.kind === 'raid' ? raidReward(c.damage, c.hpMax, c.members, c.killed, c.coinBonus) : warReward(c.result, c.points, c.mvp);
    const res = reward && (c.kind === 'raid' ? claimRaid(progress, c.key, reward, landNow) : claimWar(progress, c.key, reward, landNow));
    if (!reward || !res) return;
    setProgress(res.progress);
    sfx(res.gear ? 'chest' : 'coin');
    show(t('+{0} монет{1}!', { 0: reward.coins, 1: res.gear ? t(' и {0}', { 0: res.gear.name }) : '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.claimed]);

  if (api.attack && clan) {
    return (
      <RaidFight
        raid={clan.raid}
        attack={api.attack}
        exercise={exercise}
        progress={progress}
        bonus={clanPerks(clanLevel(clan.xp).level).raidDamage}
        onReps={(reps) => setProgress(recordActivity(progress, exercise, reps, Date.now()))}
        onHit={(damage) => send({ type: 'raidHit', attackId: api.attack!.attackId, damage })}
        onDone={() => {
          setProgress(recordRaidAttack(progress, Date.now()));
          send({ type: 'raidEnd', attackId: api.attack!.attackId });
          api.setAttack(null);
        }}
      />
    );
  }

  const head = (
    <div className="app-head">
      <h1>{t('Клан')}</h1>
      {clan && (
        <span className="muted">
          {t('{0} из {1}', { 0: clan.members.length, 1: clanPerks(clanLevel(clan.xp).level).slots })}
        </span>
      )}
    </div>
  );

  if (status !== 'online' || clan === undefined)
    return (
      <>
        {head}
        <div className="empty-card">
          {status === 'offline' ? (
            <>
              <div className="muted">{t('Нет связи с сервером кланов')}</div>
              <button className="primary" onClick={api.reconnect}>
                {t('Переподключиться')}
              </button>
            </>
          ) : (
            <div className="muted">{t('Подключаюсь…')}</div>
          )}
        </div>
      </>
    );

  // Открыли в браузере, а сервер знает бота: в клан — только из Telegram, чтобы друг вошёл под своим именем.
  if (!api.telegram && api.bot.running)
    return (
      <>
        {head}
        <div className="clan-intro">
          <Banner size={28} />
          <div>
            <div className="claim-title">{platform === 'web' ? t('Клан — для тех, кто вошёл') : t('Кланы живут в Telegram')}</div>
            <div className="muted">
              {platform === 'web'
                ? t('Войди через Яндекс или Telegram, чтобы играть в клане под своим именем. Или открой NikitenokArena в Telegram.')
                : t('Открой NikitenokArena в Telegram: там ты войдёшь под своим именем, а приглашение сработает само.')}
            </div>
          </div>
        </div>
        <WebLoginButtons />
        <a className="primary btn-link" href={invite.current ? clanInviteLink(invite.current, api.bot) : `https://t.me/${api.bot.username}`}>
          {t('Открыть в Telegram')}
        </a>
      </>
    );

  if (!clan)
    return (
      <>
        {head}
        <NoClan api={api} level={level} />
        {error && <div className="toast global">{error}</div>}
      </>
    );

  const startAttack = () => {
    track('raid_start');
    send({ type: 'raidStart', exercise });
  };
  const lv = cl!;
  const perks = clanPerks(lv.level);
  // С какого уровня дарить, помнит сервер; телефонная отметка — чтобы не показать уже забранное.
  const localGift = progress.clanGift?.clan === clan.id ? progress.clanGift.level : lv.level;
  const giftFrom = clan.giftFrom !== undefined ? Math.max(clan.giftFrom, progress.clanGift?.clan === clan.id ? progress.clanGift.level : 0) : localGift;
  const gifts = clanGiftsDue({ ...progress, clanGift: { clan: clan.id, level: giftFrom } }, clan.id, lv.level);

  return (
    <>
      {head}
      <div className="clan-card">
        <Flag flag={clan.flag} tag={clan.tag} level={lv.level} size={64} />
        <div className="clan-meta">
          <div className="clan-name">
            {clan.name} <span className="clan-tag">[{clan.tag}]</span>
          </div>
          {clanPlace(clan) && <div className="clan-place">{clanPlace(clan)}</div>}
          <div className="muted">{clan.description || t('Без описания')}</div>
          <div className="clan-badges">
            <span>{clan.open ? t('открытый') : t('по приглашению')}</span>
            {clan.minLevel > 1 && <span>{t('с {0} уровня', { 0: clan.minLevel })}</span>}
            <span>{t('рейдов выиграно: {0}', { 0: clan.raidWins })}</span>
          </div>
        </div>
      </div>
      <button className="clan-level" onClick={() => setLevelsOpen(true)}>
        <span className="clan-level-num">{lv.level}</span>
        <span className="clan-level-body">
          <span className="clan-level-title">
            {t('Уровень клана')} <span className="muted">{lv.level < CLAN_MAX_LEVEL ? t('{0} / {1} опыта', { 0: num(lv.into), 1: num(lv.need) }) : t('максимальный')}</span>
          </span>
          <span className="bar">
            <span className="bar-fill" style={{ width: `${lv.need ? (lv.into / lv.need) * 100 : 100}%` }} />
          </span>
        </span>
        <span className="chev">›</span>
      </button>
      {gifts.levels > 0 && (
        <div className="claim-card">
          <div>
            <div className="claim-title">{gifts.levels > 1 ? t('Клан вырос на {0} уровня!', { 0: gifts.levels }) : t('Клан достиг {0} уровня!', { 0: lv.level })}</div>
            <div className="muted">
              {t('Подарок: {0} монет', { 0: gifts.coins })}
              {gifts.potions.vigor ? t(' · зелье жизни ×{0}', { 0: gifts.potions.vigor }) : ''}
              {gifts.potions.might ? t(' · эликсир силы ×{0}', { 0: gifts.potions.might }) : ''}
            </div>
          </div>
          <button
            className="small-btn"
            onClick={() => send({ type: 'clanClaim', kind: 'gift', from: localGift })}
          >
            {t('Забрать')}
          </button>
        </div>
      )}
      <div className="clan-actions">
        <button
          className="secondary"
          onClick={async () => {
            const how = await share(clanInviteLink(clan.code, api.bot), t('Вступай в клан «{0}» в NikitenokArena: вместе бьём рейд-босса по выходным!', { 0: clan.name })).catch(() => null);
            if (how === 'copied') show(t('Ссылка скопирована'));
          }}
        >
          {t('Пригласить')}
        </button>
        <button className="secondary" onClick={() => setSettingsOpen(true)}>
          {clan.myRole === 'leader' ? t('Настройки') : t('О клане')}
        </button>
      </div>

      <div className="tabs">
        <button className={tab === 'raid' ? 'active' : ''} onClick={() => setTab('raid')}>
          {t('Рейд')}
        </button>
        <button className={tab === 'war' ? 'active' : ''} onClick={() => setTab('war')}>
          {t('Война')}
        </button>
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
          {t('Чат')}
        </button>
        <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>
          {t('Участники')}
        </button>
      </div>

      {tab === 'raid' && (
        <RaidTab
          clan={clan}
          progress={progress}
          attacks={perks.attacks}
          coinBonus={perks.raidCoins}
          exercise={exercise}
          setExercise={setExercise}
          onAttack={startAttack}
          onClaim={() => send({ type: 'clanClaim', kind: 'raid' })}
        />
      )}
      {tab === 'war' && (
        <WarTab
          clan={clan}
          level={lv.level}
          progress={progress}
          onToggle={(on) => send({ type: 'clanWar', on })}
          onClaim={() => send({ type: 'clanClaim', kind: 'war' })}
        />
      )}
      {tab === 'chat' && <Chat api={api} clan={clan} onClose={() => setTab('raid')} />}
      {tab === 'members' && <Members clan={clan} api={api} />}
      {levelsOpen && <LevelsSheet level={lv.level} onClose={() => setLevelsOpen(false)} />}
      {settingsOpen && <ClanSettingsSheet clan={clan} api={api} onClose={() => setSettingsOpen(false)} />}
      {(error || toast) && <div className="toast global">{error ?? toast}</div>}
    </>
  );
}

function RaidTab({ clan, progress, attacks, coinBonus, exercise, setExercise, onAttack, onClaim }: { clan: ClanView; progress: Progress; attacks: number; coinBonus: number; exercise: Exercise; setExercise: (e: Exercise) => void; onAttack: () => void; onClaim: () => void }) {
  const r = clan.raid;
  const boss = raidBoss(r.key);
  const now = Date.now();
  const tier = raidTier(r.myDamage, r.hpMax, r.members);
  const next = RAID_TIERS[RAID_TIERS.indexOf(tier) + 1];
  const fair = fairShare(r.hpMax, r.members);
  const reward = clan.reward;
  // Забрана на этом телефоне или сервер уже выдал её (на другом).
  const claimed = reward && (reward.claimed || progress.raidClaimed?.includes(reward.key));
  const dead = !!r.killedAt;
  return (
    <>
      <div className="raid-card">
        <div className="raid-stage">
          <RaidScene raidKey={r.key} dead={dead} />
          <div className="raid-when">{dead ? t('Повержен!') : r.active ? t('До конца {0}', { 0: fmtLeft(r.end - now) }) : t('Начнётся через {0}', { 0: fmtLeft(r.start - now) })}</div>
        </div>
        <div className="raid-info">
          <div className="raid-name">
            {boss.name} <span className="muted">{t('· уровень {0}', { 0: r.level })}</span>
          </div>
          <div className="muted">{boss.title}</div>
          <div className="bar big">
            <div className="bar-fill" style={{ width: `${(r.hp / r.hpMax) * 100}%`, background: boss.glow }} />
          </div>
          <div className="raid-hp">
            <b>{num(r.hp)}</b> / {num(r.hpMax)} HP
          </div>
        </div>
      </div>

      {reward?.finished && !claimed && (
        <div className="claim-card">
          <div>
            <div className="claim-title">{reward.killed ? t('Босс повержен! Твоя награда') : t('Рейд окончен. Твоя награда')}</div>
            <div className="muted">
              {t('{0} урона', { 0: num(reward.damage) })} · {raidReward(reward.damage, reward.hpMax, reward.members, reward.killed, coinBonus).tier.name}
            </div>
          </div>
          <button className="small-btn" onClick={onClaim}>
            {t('Забрать')}
          </button>
        </div>
      )}

      {r.active && !dead && (
        <>
          <div className="my-raid">
            <div>
              <div className="my-raid-dmg">
                <Swords size={15} /> {t('{0} урона', { 0: num(r.myDamage) })}
              </div>
              <div className="muted">
                {tier.id === 'none' ? t('Ударь хотя бы раз, чтобы получить награду') : t('Сейчас: {0}', { 0: tier.name })}
                {next && t(' · до «{0}» ещё {1}', { 0: next.name, 1: num(Math.max(1, Math.ceil(next.from * fair - r.myDamage))) })}
              </div>
            </div>
            <span className={`tier-badge ${tier.id}`}>{tier.name}</span>
          </div>
          <div className="tabs">
            {EXERCISES.map((e) => (
              <button key={e} className={exercise === e ? 'active' : ''} onClick={() => setExercise(e)}>
                {EXERCISE_LABELS[e]}
              </button>
            ))}
          </div>
          <button className="primary" disabled={r.attacksLeft <= 0} onClick={onAttack}>
            {r.attacksLeft > 0 ? t('Атаковать босса') : t('Атаки кончились до завтра')}
            <span className="btn-cost">
              {r.attacksLeft}/{attacks}
            </span>
          </button>
        </>
      )}

      {r.recent.length > 0 && (
        <div className="raid-feed">
          {[...r.recent].reverse().map((h, i) => (
            <span key={i}>
              {h.name} <b>−{num(h.damage)}</b>
            </span>
          ))}
        </div>
      )}

      {r.top.length > 0 && (
        <>
          <div className="section-title">{t('Урон клана')}</div>
          <div className="top">
            {r.top.map((tm, i) => (
              <div key={i} className={`top-row ${tm.me ? 'me' : ''}`}>
                <span className="top-place">{i + 1}</span>
                <span className="top-name">
                  <span className={tm.pro ? 'pro-name' : ''}>{tm.name}</span>
                </span>
                <b>{num(tm.damage)}</b>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">{t('Награды')}</div>
      <div className="tiers">
        {RAID_TIERS.slice(1).map((tm) => (
          <div key={tm.id} className={`tier ${tm.id === tier.id ? 'on' : ''}`}>
            <span className={`tier-badge ${tm.id}`}>{tm.name}</span>
            <span className="tier-need">{tm.id === 'part' ? t('любой урон') : t('от {0}', { 0: num(Math.ceil(tm.from * fair)) })}</span>
            <span className="tier-gift">
              <Coin size={12} className="coin" /> {Math.round(tm.coins * (1 + coinBonus))}
              {Object.entries(tm.potions).map(([id, n]) => (
                <span key={id} className="tier-potion">
                  <Flask size={16} color={id === 'vigor' ? '#ff6b81' : id === 'might' ? '#ffb46b' : '#7dd3fc'} scroll={id === 'swap'} />×{n}
                </span>
              ))}
              {tm.chest && t(' · сундук')}
            </span>
          </div>
        ))}
        <div className="muted tiers-note">{t('Если клан добьёт босса, монеты удваиваются, а каждому, кто бился, достаётся сундук рейда со снаряжением. Атак — {0} в день, каждая длится минуту.', { 0: attacks })}{coinBonus > 0 && t(' Уровень клана добавляет +{0}% монет.', { 0: Math.round(coinBonus * 100) })}</div>
      </div>
    </>
  );
}

/** Видимая часть экрана: при открытой клавиатуре она меньше окна, и чат подстраивается под неё. */
function useVisibleViewport() {
  const read = () => ({ top: window.visualViewport?.offsetTop ?? 0, height: window.visualViewport?.height ?? window.innerHeight });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const v = window.visualViewport;
    const on = () => setVp(read());
    v?.addEventListener('resize', on);
    v?.addEventListener('scroll', on);
    window.addEventListener('resize', on);
    return () => {
      v?.removeEventListener('resize', on);
      v?.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
    };
  }, []);
  return vp;
}

/** Чат на весь экран: поле ввода всегда над клавиатурой, страница под ним не двигается. */
const RANK = { leader: 2, officer: 1, member: 0 };

/** Глава и заместители модерируют тех, кто ниже: удалить сообщение, запретить писать. */
function ModButtons({ api, clan, target, msgId, onDone }: { api: ReturnType<typeof useClan>; clan: ClanView; target: string; msgId?: number; onDone: () => void }) {
  const m = clan.members.find((x) => x.id === target);
  const can = RANK[clan.myRole] >= 1 && (!m || RANK[clan.myRole] > RANK[m.role]);
  if (!can) return null;
  const act = (msg: Parameters<typeof api.send>[0]) => {
    api.send(msg);
    onDone();
  };
  const muted = (m?.mutedUntil ?? 0) > Date.now();
  return (
    <div className="mod-row">
      {msgId != null && (
        <button className="small-btn ghost" onClick={() => act({ type: 'chatDelete', id: msgId })}>
          {t('Удалить сообщение')}
        </button>
      )}
      {m &&
        (muted ? (
          <button className="small-btn ghost" onClick={() => act({ type: 'clanMute', id: target, hours: 0 })}>
            {t('Разрешить писать')}
          </button>
        ) : (
          <>
            <button className="small-btn ghost" onClick={() => act({ type: 'clanMute', id: target, hours: 1 })}>
              {t('Молчать 1 ч')}
            </button>
            <button className="small-btn ghost" onClick={() => act({ type: 'clanMute', id: target, hours: 24 })}>
              {t('Молчать 24 ч')}
            </button>
          </>
        ))}
    </div>
  );
}

function Chat({ api, clan, onClose }: { api: ReturnType<typeof useClan>; clan: ClanView; onClose: () => void }) {
  const [text, setText] = useState('');
  const [menu, setMenu] = useState<PlayerMenuTarget | null>(null);
  const hidden = new Set(clan.hidden ?? []);
  const mutedUntil = (clan.mutedUntil ?? 0) > Date.now() ? clan.mutedUntil! : 0;
  const list = useRef<HTMLDivElement>(null);
  const vp = useVisibleViewport();
  const meId = clan.members.find((m) => m.me)?.id;
  const toBottom = () => list.current?.scrollTo({ top: list.current.scrollHeight });
  useEffect(toBottom, [api.chat.length, vp.height]);
  // Пока открыт чат, страница под ним не прокручивается.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('locked');
    return () => html.classList.remove('locked');
  }, []);
  const sendIt = () => {
    if (!text.trim()) return;
    api.send({ type: 'chatSend', text });
    setText('');
  };
  return (
    <div className="chat-screen" style={{ top: vp.top, height: vp.height }}>
      <div className="chat-head">
        <button className="back" onClick={onClose} aria-label={t('Назад')}>
          ‹
        </button>
        <Flag flag={clan.flag} tag={clan.tag} level={clanLevel(clan.xp).level} size={30} />
        <div className="chat-title">
          <div>{clan.name}</div>
          <div className="muted">
            {t('{0} в сети · {1} в клане', { 0: clan.members.filter((m) => m.online).length, 1: clan.members.length })}
          </div>
        </div>
      </div>
      <div className="chat-list" ref={list}>
        {api.chat.length === 0 && <div className="muted">{t('Пока тихо. Напиши первым!')}</div>}
        {api.chat.filter((m) => !hidden.has(m.from)).map((m) =>
          m.system ? (
            <div key={m.id} className="chat-system">
              {m.key ? tMsg(m.key, m.vars) : t(m.text)}
            </div>
          ) : (
            <div
              key={m.id}
              className={`chat-msg ${m.from === meId ? 'mine' : ''}`}
              role="button"
              onClick={() => (m.from === meId ? null : setMenu({ id: m.from, name: m.name, where: 'chat', msg: { id: m.id, text: m.text } }))}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className={`chat-name ${m.pro ? 'pro-name' : ''}`} style={m.pro ? undefined : { color: nameColor(m.name || '?') }}>
                {m.name}
              </span>
              <span className="chat-time">{new Date(m.at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}</span>
              <div className="chat-text">{m.text}</div>
            </div>
          ),
        )}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          sendIt();
        }}
      >
        <input value={text} maxLength={CHAT_MAX} disabled={!!mutedUntil} onChange={(e) => setText(e.target.value)} onFocus={() => setTimeout(toBottom, 300)} placeholder={mutedUntil ? muteText(mutedUntil) : t('Сообщение клану')} enterKeyHint="send" />
        <button type="submit" aria-label={t('Отправить')} disabled={!text.trim() || !!mutedUntil} onPointerDown={(e) => e.preventDefault()}>
          <Send />
        </button>
      </form>
      {menu && (
        <PlayerMenu target={menu} onBlocked={api.hide} onClose={() => setMenu(null)}>
          <ModButtons api={api} clan={clan} target={menu.id} msgId={menu.msg?.id} onDone={() => setMenu(null)} />
        </PlayerMenu>
      )}
    </div>
  );
}

function Members({ clan, api }: { clan: ClanView; api: ReturnType<typeof useClan> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [menu, setMenu] = useState<PlayerMenuTarget | null>(null);
  const rank = { leader: 2, officer: 1, member: 0 };
  return (
    <div className="members">
      {clan.members.map((m) => {
        const canKick = rank[clan.myRole] >= 1 && rank[clan.myRole] > rank[m.role] && !m.me;
        const canRole = clan.myRole === 'leader' && !m.me;
        return (
          <div key={m.id} className="member">
            <button className="member-row" onClick={() => setOpen(open === m.id ? null : m.id)}>
              <span className={`dot ${m.online ? 'on' : ''}`} />
              <span className="member-name">
                <span className={m.pro ? 'pro-name' : ''}>{m.name}</span>
                {m.pro && <span className="pro-chip">PRO</span>}
                {m.me && <span className="muted"> {t('· ты')}</span>}
              </span>
              {ROLE[m.role] && <span className={`role ${m.role}`}>{ROLE[m.role]}</span>}
              <span className="member-level">{t('{0} ур.', { 0: m.level })}</span>
              <span className="member-dmg">
                <Swords size={12} /> {num(m.raidDamage)}
              </span>
            </button>
            {open === m.id && (
              <div className="member-actions">
                <span className="member-xp muted">{t('Вклад в клан: {0} опыта', { 0: num(m.xp) })}</span>
                {canRole && m.role !== 'officer' && (
                  <button className="small-btn ghost" onClick={() => api.send({ type: 'clanRole', id: m.id, role: 'officer' })}>
                    {t('Сделать заместителем')}
                  </button>
                )}
                {canRole && m.role === 'officer' && (
                  <button className="small-btn ghost" onClick={() => api.send({ type: 'clanRole', id: m.id, role: 'member' })}>
                    {t('Снять заместителя')}
                  </button>
                )}
                {canRole && (
                  <button className="small-btn ghost" onClick={() => api.send({ type: 'clanRole', id: m.id, role: 'leader' })}>
                    {t('Передать главенство')}
                  </button>
                )}
                {canKick && (
                  <button className="small-btn danger" onClick={() => api.send({ type: 'clanKick', id: m.id })}>
                    {t('Исключить')}
                  </button>
                )}
                {(m.mutedUntil ?? 0) > Date.now() && <span className="muted">{t('Молчит до {0}', { 0: new Date(m.mutedUntil!).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) })}</span>}
                {!m.me && (
                  <button className="small-btn ghost" onClick={() => setMenu({ id: m.id, name: m.name, where: 'clan' })}>
                    {t('Ещё…')}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {menu && (
        <PlayerMenu target={menu} onBlocked={api.hide} onClose={() => setMenu(null)}>
          <ModButtons api={api} clan={clan} target={menu.id} onDone={() => setMenu(null)} />
        </PlayerMenu>
      )}
    </div>
  );
}

function SettingsForm({ initial, submit, onSubmit }: { initial: ClanSettings; submit: string; onSubmit: (s: ClanSettings) => void }) {
  const [s, setS] = useState(initial);
  const [bad, setBad] = useState<string | null>(null);
  return (
    <form
      className="clan-form"
      onSubmit={(e) => {
        e.preventDefault();
        // Сервер проверит и сам, здесь — чтобы сразу подсказать.
        const why = badName(s.name) || badName(s.tag) || badName(s.city) ? BAD_NAME : hasProfanity(s.description) ? t('Выбери другие слова для описания') : null;
        setBad(why);
        if (!why) onSubmit(s);
      }}
    >
      <label>
        {t('Название')}
        <input value={s.name} maxLength={24} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder={t('Железные спины')} />
      </label>
      <label>
        {t('Тег (2–4 знака)')}
        <input value={s.tag} maxLength={4} onChange={(e) => setS({ ...s, tag: e.target.value.toUpperCase() })} placeholder={t('ЖС')} />
      </label>
      <div className="form-label">{t('Флаг клана')}</div>
      <FlagPicker flag={s.flag} tag={s.tag} onChange={(flag) => setS({ ...s, flag })} />
      <div className="form-pair">
        <label>
          {t('Страна')}
          <select value={s.country} onChange={(e) => setS({ ...s, country: e.target.value })}>
            <option value="">{t('Не указана')}</option>
            {Object.entries(COUNTRIES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Город')}
          <input value={s.city} maxLength={30} onChange={(e) => setS({ ...s, city: e.target.value })} placeholder={t('Москва')} />
        </label>
      </div>
      <label>
        {t('Описание')}
        <textarea value={s.description} maxLength={200} rows={3} onChange={(e) => setS({ ...s, description: e.target.value })} placeholder={t('Кто мы и как тренируемся')} />
      </label>
      <label className="toggle-row">
        <div>
          <div className="toggle-title">{t('Открытый клан')}</div>
          <div className="muted">{t('Вступить может любой. Если выключить — только по ссылке-приглашению.')}</div>
        </div>
        <input type="checkbox" className="switch" checked={s.open} onChange={(e) => setS({ ...s, open: e.target.checked })} />
      </label>
      <label>
        {t('С какого уровня героя')}
        <input type="number" min={1} max={99} value={s.minLevel} onChange={(e) => setS({ ...s, minLevel: Number(e.target.value) })} />
      </label>
      {bad && <div className="muted center warn">{bad}</div>}
      <button className="primary" type="submit">
        {submit}
      </button>
    </form>
  );
}

function ClanSettingsSheet({ clan, api, onClose }: { clan: ClanView; api: ReturnType<typeof useClan>; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  return (
    <Sheet onClose={onClose}>
      <div className="level-title">{clan.myRole === 'leader' ? t('Настройки клана') : t('Клан «{0}»', { 0: clan.name })}</div>
      {clan.myRole === 'leader' ? (
        <SettingsForm
          initial={{ name: clan.name, tag: clan.tag, description: clan.description, open: clan.open, minLevel: clan.minLevel, flag: clan.flag, country: clan.country, city: clan.city }}
          submit={t('Сохранить')}
          onSubmit={(s) => {
            api.send({ type: 'clanUpdate', clan: s });
            onClose();
          }}
        />
      ) : (
        <div className="about-clan">
          <Flag flag={clan.flag} tag={clan.tag} level={clanLevel(clan.xp).level} size={84} />
          <div>
            {clanPlace(clan) && <div className="clan-place">{clanPlace(clan)}</div>}
            <div className="settings-note">{clan.description || t('Глава клана пока не добавил описание.')}</div>
          </div>
        </div>
      )}
      <div className="settings-note">
        <b>{t('Код приглашения: {0}', { 0: clan.code })}</b>{t('. Его можно ввести вручную, если ссылка не открывается.')}
      </div>
      {leaving ? (
        <div className="danger-row">
          <span>{clan.members.length === 1 ? t('Ты последний: клан будет распущен.') : t('Выйти из клана? Урон в рейде останется клану.')}</span>
          <button
            className="small-btn danger"
            onClick={() => {
              api.send({ type: 'clanLeave' });
              onClose();
            }}
          >
            {t('Выйти')}
          </button>
          <button className="small-btn ghost" onClick={() => setLeaving(false)}>
            {t('Отмена')}
          </button>
        </div>
      ) : (
        <button className="link danger-link" onClick={() => setLeaving(true)}>
          {t('Выйти из клана')}
        </button>
      )}
    </Sheet>
  );
}

function NoClan({ api, level }: { api: ReturnType<typeof useClan>; level: number }) {
  const [q, setQ] = useState('');
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const tm = setTimeout(() => api.send({ type: 'clanSearch', q }), q ? 300 : 0);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <>
      <div className="clan-intro">
        <Banner size={28} />
        <div>
          <div className="claim-title">{t('Вместе сильнее')}</div>
          <div className="muted">{t('По выходным клан бьёт огромного рейд-босса. Чем больше урона нанесёшь, тем лучше награда, а если добьёте босса — самая крупная.')}</div>
        </div>
      </div>
      <button className="primary" onClick={() => setCreating(true)}>
        {t('Создать клан')}
      </button>
      <form
        className="join"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) api.send({ type: 'clanJoin', code });
        }}
      >
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('Код приглашения')} maxLength={8} />
        <button disabled={code.trim().length < 4}>{t('Войти')}</button>
      </form>
      <div className="section-title">{t('Кланы')}</div>
      <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Название, тег или город')} />
      <div className="clan-list">
        {api.list?.length === 0 && <div className="muted">{t('Пока ни одного клана. Создай первый!')}</div>}
        {api.list?.map((c) => {
          const low = level < c.minLevel;
          return (
            <div key={c.id} className="clan-item">
              <Flag flag={c.flag} tag={c.tag} level={clanLevel(c.xp).level} size={46} />
              <div className="clan-meta">
                <div className="clan-name small">
                  {c.name} <span className="clan-tag">[{c.tag}]</span>
                </div>
                <div className="muted">
                  {t('{0} ур.', { 0: clanLevel(c.xp).level })} · {c.members}/{clanPerks(clanLevel(c.xp).level).slots}
                  {clanPlace(c) && ` · ${clanPlace(c)}`}
                  {c.minLevel > 1 && t(' · с {0} ур.', { 0: c.minLevel })}
                </div>
              </div>
              {c.open && !low ? (
                <button className="small-btn" onClick={() => api.send({ type: 'clanJoin', id: c.id })}>
                  {t('Вступить')}
                </button>
              ) : (
                <span className="shop-lock">
                  <Lock size={12} /> {c.open ? t('с {0} ур.', { 0: c.minLevel }) : t('по приглашению')}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {creating && (
        <Sheet onClose={() => setCreating(false)}>
          <div className="level-title">{t('Новый клан')}</div>
          <SettingsForm
            initial={{ name: '', tag: '', description: '', open: true, minLevel: 1, flag: defaultFlag(String(Math.random())), country: 'RU', city: '' }}
            submit={t('Создать')}
            onSubmit={(s) => {
              api.send({ type: 'clanCreate', clan: s });
              setCreating(false);
            }}
          />
        </Sheet>
      )}
    </>
  );
}



/** Уровни клана и что они дают. */
function LevelsSheet({ level, onClose }: { level: number; onClose: () => void }) {
  const perks = clanPerks(level);
  const now = useRef<HTMLDivElement>(null);
  useEffect(() => now.current?.scrollIntoView({ block: 'center' }), []);
  return (
    <Sheet onClose={onClose}>
      <div className="level-title">{t('Уровень клана {0}', { 0: level })}</div>
      <div className="perk-grid">
        <span>
          <b>{perks.slots}</b> {t('мест')}
        </span>
        <span>
          <b>{perks.attacks}</b> {t('атаки в день')}
        </span>
        <span>
          <b>+{Math.round(perks.raidCoins * 100)}%</b> {t('монет рейда')}
        </span>
        <span>
          <b>+{Math.round(perks.raidDamage * 100)}%</b> {t('урона в рейде')}
        </span>
      </div>
      <div className="muted">{t('Опыт клану приносят повторы участников в приключении (до {0} в день от каждого), урон по рейд-боссу, победа над ним и войны кланов. На каждом новом уровне все участники получают подарок.', { 0: CLAN_REPS_PER_DAY })}</div>
      <div className="levels-list">
        {Array.from({ length: CLAN_MAX_LEVEL - 1 }, (_, i) => i + 2).map((l) => {
          const gift = clanGift(l);
          return (
            <div key={l} ref={l === level + 1 ? now : undefined} className={`level-row ${l <= level ? 'done' : ''} ${l === level + 1 ? 'next' : ''}`}>
              <span className="level-row-num">{l}</span>
              <span className="level-row-text">
                {[...clanUnlocks(l), t('подарок {0} монет{1}', { 0: gift.coins, 1: gift.potions.vigor ? t(' и эликсиры') : '' })].join(' · ')}
              </span>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
