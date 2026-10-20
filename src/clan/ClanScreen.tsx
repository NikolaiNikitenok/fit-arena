import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX, clanPlace, COUNTRIES, defaultFlag, type ClanMemberView, type ClanSettings, type ClanView } from '../../shared/clan';
import { CLAN_MAX_LEVEL, CLAN_REPS_PER_DAY, clanGift, clanLevel, clanPerks, clanUnlocks } from '../../shared/clanLevel';
import { fairShare, RAID_TIERS, raidBoss, raidReward, raidTier } from '../../shared/raid';
import { claimClanGift, claimRaid, claimWar, recordActivity, recordRaidAttack, clanGiftsDue, clearClanPending, heroLevel, heroXp, Progress, syncClanGift } from '../game/progress';
import { Banner, Coin, Flask, Lock, Send, Swords } from '../icons';
import { EXERCISE_LABELS, Exercise } from '../repCounter';
import { clanInviteCode, clanInviteLink, share } from '../telegram';
import { RaidFight, RaidScene } from './RaidFight';
import { Flag, FlagPicker } from './Flag';
import { useClan } from './useClan';
import { WarTab } from './War';
import { warReward } from '../../shared/war';
import { sfx } from '../audio';

const EXERCISES: Exercise[] = ['squat', 'pushup', 'situp'];
const ROLE: Record<ClanMemberView['role'], string> = { leader: 'глава', officer: 'заместитель', member: '' };

const fmtLeft = (ms: number) => {
  const h = Math.max(0, Math.floor(ms / 3600_000));
  return h >= 24 ? `${Math.floor(h / 24)} д ${h % 24} ч` : h >= 1 ? `${h} ч ${Math.floor((ms % 3600_000) / 60000)} мин` : `${Math.max(1, Math.ceil(ms / 60000))} мин`;
};
const num = (n: number) => n.toLocaleString('ru');

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

  const show = (t: string) => {
    setToast(t);
    setTimeout(() => setToast((x) => (x === t ? null : t)), 3000);
  };

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
      <h1>Клан</h1>
      {clan && (
        <span className="muted">
          {clan.members.length} из {clanPerks(clanLevel(clan.xp).level).slots}
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
              <div className="muted">Нет связи с сервером кланов</div>
              <button className="primary" onClick={api.reconnect}>
                Переподключиться
              </button>
            </>
          ) : (
            <div className="muted">Подключаюсь…</div>
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
            <div className="claim-title">Кланы живут в Telegram</div>
            <div className="muted">Открой NikitenokArena в Telegram: там ты войдёшь под своим именем, а приглашение сработает само.</div>
          </div>
        </div>
        <a className="primary btn-link" href={invite.current ? clanInviteLink(invite.current, api.bot) : `https://t.me/${api.bot.username}`}>
          Открыть в Telegram
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

  const startAttack = () => send({ type: 'raidStart', exercise });
  const lv = cl!;
  const perks = clanPerks(lv.level);
  const gifts = clanGiftsDue(progress, clan.id, lv.level);

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
          <div className="muted">{clan.description || 'Без описания'}</div>
          <div className="clan-badges">
            <span>{clan.open ? 'открытый' : 'по приглашению'}</span>
            {clan.minLevel > 1 && <span>с {clan.minLevel} уровня</span>}
            <span>рейдов выиграно: {clan.raidWins}</span>
          </div>
        </div>
      </div>
      <button className="clan-level" onClick={() => setLevelsOpen(true)}>
        <span className="clan-level-num">{lv.level}</span>
        <span className="clan-level-body">
          <span className="clan-level-title">
            Уровень клана <span className="muted">{lv.level < CLAN_MAX_LEVEL ? `${num(lv.into)} / ${num(lv.need)} опыта` : 'максимальный'}</span>
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
            <div className="claim-title">{gifts.levels > 1 ? `Клан вырос на ${gifts.levels} уровня!` : `Клан достиг ${lv.level} уровня!`}</div>
            <div className="muted">
              Подарок: {gifts.coins} монет
              {gifts.potions.vigor ? ` · зелье жизни ×${gifts.potions.vigor}` : ''}
              {gifts.potions.might ? ` · эликсир силы ×${gifts.potions.might}` : ''}
            </div>
          </div>
          <button
            className="small-btn"
            onClick={() => {
              const next = claimClanGift(progress, clan.id, lv.level);
              if (next) setProgress(next);
              show(`+${gifts.coins} монет!`);
            }}
          >
            Забрать
          </button>
        </div>
      )}
      <div className="clan-actions">
        <button
          className="secondary"
          onClick={async () => {
            const how = await share(clanInviteLink(clan.code, api.bot), `Вступай в клан «${clan.name}» в NikitenokArena: вместе бьём рейд-босса по выходным!`).catch(() => null);
            if (how === 'copied') show('Ссылка скопирована');
          }}
        >
          Пригласить
        </button>
        <button className="secondary" onClick={() => setSettingsOpen(true)}>
          {clan.myRole === 'leader' ? 'Настройки' : 'О клане'}
        </button>
      </div>

      <div className="tabs">
        <button className={tab === 'raid' ? 'active' : ''} onClick={() => setTab('raid')}>
          Рейд
        </button>
        <button className={tab === 'war' ? 'active' : ''} onClick={() => setTab('war')}>
          Война
        </button>
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
          Чат
        </button>
        <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>
          Участники
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
          onClaim={() => {
            const r = clan.reward!;
            const reward = raidReward(r.damage, r.hpMax, r.members, r.killed, perks.raidCoins);
            const res = claimRaid(progress, r.key, reward, landNow);
            if (!res) return;
            setProgress(res.progress);
            sfx(res.gear ? 'chest' : 'coin');
            show(`+${reward.coins} монет${res.gear ? ` и ${res.gear.name}` : ''}!`);
          }}
        />
      )}
      {tab === 'war' && (
        <WarTab
          clan={clan}
          level={lv.level}
          progress={progress}
          onToggle={(on) => send({ type: 'clanWar', on })}
          onClaim={(war) => {
            const r = war.reward && warReward(war.reward.result, war.reward.points, war.reward.mvp);
            const res = r && claimWar(progress, war.reward!.key, r, landNow);
            if (!r || !res) return;
            setProgress(res.progress);
            sfx(res.gear ? 'chest' : 'coin');
            show(`+${r.coins} монет${res.gear ? ` и ${res.gear.name}` : ''}!`);
          }}
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
  const claimed = reward && progress.raidClaimed?.includes(reward.key);
  const dead = !!r.killedAt;
  return (
    <>
      <div className="raid-card">
        <div className="raid-stage">
          <RaidScene raidKey={r.key} dead={dead} />
          <div className="raid-when">{dead ? 'Повержен!' : r.active ? `До конца ${fmtLeft(r.end - now)}` : `Начнётся через ${fmtLeft(r.start - now)}`}</div>
        </div>
        <div className="raid-info">
          <div className="raid-name">
            {boss.name} <span className="muted">· уровень {r.level}</span>
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
            <div className="claim-title">{reward.killed ? 'Босс повержен! Твоя награда' : 'Рейд окончен. Твоя награда'}</div>
            <div className="muted">
              {num(reward.damage)} урона · {raidReward(reward.damage, reward.hpMax, reward.members, reward.killed, coinBonus).tier.name}
            </div>
          </div>
          <button className="small-btn" onClick={onClaim}>
            Забрать
          </button>
        </div>
      )}

      {r.active && !dead && (
        <>
          <div className="my-raid">
            <div>
              <div className="my-raid-dmg">
                <Swords size={15} /> {num(r.myDamage)} урона
              </div>
              <div className="muted">
                {tier.id === 'none' ? 'Ударь хотя бы раз, чтобы получить награду' : `Сейчас: ${tier.name}`}
                {next && ` · до «${next.name}» ещё ${num(Math.max(1, Math.ceil(next.from * fair - r.myDamage)))}`}
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
            {r.attacksLeft > 0 ? 'Атаковать босса' : 'Атаки кончились до завтра'}
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
          <div className="section-title">Урон клана</div>
          <div className="top">
            {r.top.map((t, i) => (
              <div key={i} className={`top-row ${t.me ? 'me' : ''}`}>
                <span className="top-place">{i + 1}</span>
                <span className="top-name">
                  <span className={t.pro ? 'pro-name' : ''}>{t.name}</span>
                </span>
                <b>{num(t.damage)}</b>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Награды</div>
      <div className="tiers">
        {RAID_TIERS.slice(1).map((t) => (
          <div key={t.id} className={`tier ${t.id === tier.id ? 'on' : ''}`}>
            <span className={`tier-badge ${t.id}`}>{t.name}</span>
            <span className="tier-need">{t.id === 'part' ? 'любой урон' : `от ${num(Math.ceil(t.from * fair))}`}</span>
            <span className="tier-gift">
              <Coin size={12} className="coin" /> {Math.round(t.coins * (1 + coinBonus))}
              {Object.entries(t.potions).map(([id, n]) => (
                <span key={id} className="tier-potion">
                  <Flask size={16} color={id === 'vigor' ? '#ff6b81' : id === 'might' ? '#ffb46b' : '#7dd3fc'} scroll={id === 'swap'} />×{n}
                </span>
              ))}
              {t.chest && ' · сундук'}
            </span>
          </div>
        ))}
        <div className="muted tiers-note">Если клан добьёт босса, монеты удваиваются, а каждому, кто бился, достаётся сундук рейда со снаряжением. Атак — {attacks} в день, каждая длится минуту.{coinBonus > 0 && ` Уровень клана добавляет +${Math.round(coinBonus * 100)}% монет.`}</div>
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
function Chat({ api, clan, onClose }: { api: ReturnType<typeof useClan>; clan: ClanView; onClose: () => void }) {
  const [text, setText] = useState('');
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
        <button className="back" onClick={onClose} aria-label="Назад">
          ‹
        </button>
        <Flag flag={clan.flag} tag={clan.tag} level={clanLevel(clan.xp).level} size={30} />
        <div className="chat-title">
          <div>{clan.name}</div>
          <div className="muted">
            {clan.members.filter((m) => m.online).length} в сети · {clan.members.length} в клане
          </div>
        </div>
      </div>
      <div className="chat-list" ref={list}>
        {api.chat.length === 0 && <div className="muted">Пока тихо. Напиши первым!</div>}
        {api.chat.map((m) =>
          m.system ? (
            <div key={m.id} className="chat-system">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className={`chat-msg ${m.from === meId ? 'mine' : ''}`}>
              <span className={`chat-name ${m.pro ? 'pro-name' : ''}`} style={m.pro ? undefined : { color: nameColor(m.name || '?') }}>
                {m.name}
              </span>
              <span className="chat-time">{new Date(m.at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span>
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
        <input value={text} maxLength={CHAT_MAX} onChange={(e) => setText(e.target.value)} onFocus={() => setTimeout(toBottom, 300)} placeholder="Сообщение клану" enterKeyHint="send" />
        <button type="submit" aria-label="Отправить" disabled={!text.trim()} onPointerDown={(e) => e.preventDefault()}>
          <Send />
        </button>
      </form>
    </div>
  );
}

function Members({ clan, api }: { clan: ClanView; api: ReturnType<typeof useClan> }) {
  const [open, setOpen] = useState<string | null>(null);
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
                {m.me && <span className="muted"> · ты</span>}
              </span>
              {ROLE[m.role] && <span className={`role ${m.role}`}>{ROLE[m.role]}</span>}
              <span className="member-level">{m.level} ур.</span>
              <span className="member-dmg">
                <Swords size={12} /> {num(m.raidDamage)}
              </span>
            </button>
            {open === m.id && (
              <div className="member-actions">
                <span className="member-xp muted">Вклад в клан: {num(m.xp)} опыта</span>
                {canRole && m.role !== 'officer' && (
                  <button className="small-btn ghost" onClick={() => api.send({ type: 'clanRole', id: m.id, role: 'officer' })}>
                    Сделать заместителем
                  </button>
                )}
                {canRole && m.role === 'officer' && (
                  <button className="small-btn ghost" onClick={() => api.send({ type: 'clanRole', id: m.id, role: 'member' })}>
                    Снять заместителя
                  </button>
                )}
                {canRole && (
                  <button className="small-btn ghost" onClick={() => api.send({ type: 'clanRole', id: m.id, role: 'leader' })}>
                    Передать главенство
                  </button>
                )}
                {canKick && (
                  <button className="small-btn danger" onClick={() => api.send({ type: 'clanKick', id: m.id })}>
                    Исключить
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SettingsForm({ initial, submit, onSubmit }: { initial: ClanSettings; submit: string; onSubmit: (s: ClanSettings) => void }) {
  const [s, setS] = useState(initial);
  return (
    <form
      className="clan-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(s);
      }}
    >
      <label>
        Название
        <input value={s.name} maxLength={24} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="Железные спины" />
      </label>
      <label>
        Тег (2–4 знака)
        <input value={s.tag} maxLength={4} onChange={(e) => setS({ ...s, tag: e.target.value.toUpperCase() })} placeholder="ЖС" />
      </label>
      <div className="form-label">Флаг клана</div>
      <FlagPicker flag={s.flag} tag={s.tag} onChange={(flag) => setS({ ...s, flag })} />
      <div className="form-pair">
        <label>
          Страна
          <select value={s.country} onChange={(e) => setS({ ...s, country: e.target.value })}>
            <option value="">Не указана</option>
            {Object.entries(COUNTRIES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Город
          <input value={s.city} maxLength={30} onChange={(e) => setS({ ...s, city: e.target.value })} placeholder="Москва" />
        </label>
      </div>
      <label>
        Описание
        <textarea value={s.description} maxLength={200} rows={3} onChange={(e) => setS({ ...s, description: e.target.value })} placeholder="Кто мы и как тренируемся" />
      </label>
      <label className="toggle-row">
        <div>
          <div className="toggle-title">Открытый клан</div>
          <div className="muted">Вступить может любой. Если выключить — только по ссылке-приглашению.</div>
        </div>
        <input type="checkbox" className="switch" checked={s.open} onChange={(e) => setS({ ...s, open: e.target.checked })} />
      </label>
      <label>
        С какого уровня героя
        <input type="number" min={1} max={99} value={s.minLevel} onChange={(e) => setS({ ...s, minLevel: Number(e.target.value) })} />
      </label>
      <button className="primary" type="submit">
        {submit}
      </button>
    </form>
  );
}

function ClanSettingsSheet({ clan, api, onClose }: { clan: ClanView; api: ReturnType<typeof useClan>; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
        <div className="level-title">{clan.myRole === 'leader' ? 'Настройки клана' : `Клан «${clan.name}»`}</div>
        {clan.myRole === 'leader' ? (
          <SettingsForm
            initial={{ name: clan.name, tag: clan.tag, description: clan.description, open: clan.open, minLevel: clan.minLevel, flag: clan.flag, country: clan.country, city: clan.city }}
            submit="Сохранить"
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
              <div className="settings-note">{clan.description || 'Глава клана пока не добавил описание.'}</div>
            </div>
          </div>
        )}
        <div className="settings-note">
          <b>Код приглашения: {clan.code}</b>. Его можно ввести вручную, если ссылка не открывается.
        </div>
        {leaving ? (
          <div className="danger-row">
            <span>{clan.members.length === 1 ? 'Ты последний: клан будет распущен.' : 'Выйти из клана? Урон в рейде останется клану.'}</span>
            <button
              className="small-btn danger"
              onClick={() => {
                api.send({ type: 'clanLeave' });
                onClose();
              }}
            >
              Выйти
            </button>
            <button className="small-btn ghost" onClick={() => setLeaving(false)}>
              Отмена
            </button>
          </div>
        ) : (
          <button className="link danger-link" onClick={() => setLeaving(true)}>
            Выйти из клана
          </button>
        )}
      </div>
    </div>
  );
}

function NoClan({ api, level }: { api: ReturnType<typeof useClan>; level: number }) {
  const [q, setQ] = useState('');
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => api.send({ type: 'clanSearch', q }), q ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <>
      <div className="clan-intro">
        <Banner size={28} />
        <div>
          <div className="claim-title">Вместе сильнее</div>
          <div className="muted">По выходным клан бьёт огромного рейд-босса. Чем больше урона нанесёшь, тем лучше награда, а если добьёте босса — самая крупная.</div>
        </div>
      </div>
      <button className="primary" onClick={() => setCreating(true)}>
        Создать клан
      </button>
      <form
        className="join"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) api.send({ type: 'clanJoin', code });
        }}
      >
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Код приглашения" maxLength={8} />
        <button disabled={code.trim().length < 4}>Войти</button>
      </form>
      <div className="section-title">Кланы</div>
      <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название, тег или город" />
      <div className="clan-list">
        {api.list?.length === 0 && <div className="muted">Пока ни одного клана. Создай первый!</div>}
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
                  {clanLevel(c.xp).level} ур. · {c.members}/{clanPerks(clanLevel(c.xp).level).slots}
                  {clanPlace(c) && ` · ${clanPlace(c)}`}
                  {c.minLevel > 1 && ` · с ${c.minLevel} ур.`}
                </div>
              </div>
              {c.open && !low ? (
                <button className="small-btn" onClick={() => api.send({ type: 'clanJoin', id: c.id })}>
                  Вступить
                </button>
              ) : (
                <span className="shop-lock">
                  <Lock size={12} /> {c.open ? `с ${c.minLevel} ур.` : 'по приглашению'}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {creating && (
        <div className="sheet" onClick={() => setCreating(false)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <div className="level-title">Новый клан</div>
            <SettingsForm
              initial={{ name: '', tag: '', description: '', open: true, minLevel: 1, flag: defaultFlag(String(Math.random())), country: 'RU', city: '' }}
              submit="Создать"
              onSubmit={(s) => {
                api.send({ type: 'clanCreate', clan: s });
                setCreating(false);
              }}
            />
          </div>
        </div>
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
    <div className="sheet" onClick={onClose}>
      <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
        <div className="level-title">Уровень клана {level}</div>
        <div className="perk-grid">
          <span>
            <b>{perks.slots}</b> мест
          </span>
          <span>
            <b>{perks.attacks}</b> атаки в день
          </span>
          <span>
            <b>+{Math.round(perks.raidCoins * 100)}%</b> монет рейда
          </span>
          <span>
            <b>+{Math.round(perks.raidDamage * 100)}%</b> урона в рейде
          </span>
        </div>
        <div className="muted">Опыт клану приносят повторы участников в приключении (до {CLAN_REPS_PER_DAY} в день от каждого), урон по рейд-боссу, победа над ним и войны кланов. На каждом новом уровне все участники получают подарок.</div>
        <div className="levels-list">
          {Array.from({ length: CLAN_MAX_LEVEL - 1 }, (_, i) => i + 2).map((l) => {
            const gift = clanGift(l);
            return (
              <div key={l} ref={l === level + 1 ? now : undefined} className={`level-row ${l <= level ? 'done' : ''} ${l === level + 1 ? 'next' : ''}`}>
                <span className="level-row-num">{l}</span>
                <span className="level-row-text">
                  {[...clanUnlocks(l), `подарок ${gift.coins} монет${gift.potions.vigor ? ' и эликсиры' : ''}`].join(' · ')}
                </span>
              </div>
            );
          })}
        </div>
        <button className="link" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
