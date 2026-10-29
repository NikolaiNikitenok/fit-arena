// Экран друзей во вкладке «Дуэль»: список, заявки, вызов на дуэль в один тап.
import { useEffect, useState } from 'react';
import type { FriendsState, FriendView } from '../../shared/protocol';
import { leagueOf } from '../../shared/rating';
import { Check, Cross, Flame, Star, Swords, UserPlus, Users } from '../icons';
import { EXERCISE_LABELS, type Exercise } from '../repCounter';
import { friendInviteCode, friendInviteLink, openPassInTelegram, platform, share } from '../telegram';
import { giftTrial, useProOffer } from '../cloud';
import { payStars } from '../payments';
import { friendsApi, type FriendsReply, lastDayText, NotTelegram } from './api';
import { PlayerMenu, type PlayerMenuTarget } from '../moderation/PlayerMenu';
import { Sheet } from '../Sheet';
import { itemById } from '../game/items';
import { loadProgress, saveProgress } from '../game/progress';
import { claimRef, INVITED_COINS, REF_COINS, REF_LEADER_AT, refCount, type RefReward, refPending } from '../game/referral';
import { t } from '../i18n';

const NOTE_TEXT = {
  app: t('Друг в игре — ему пришло приглашение. Ждём его на арене!'),
  bot: t('Бот написал другу. Вызов действует 10 минут.'),
  quiet: t('Ночью бот не пишет. Друг увидит вызов, если сам откроет игру.'),
  off: t('У друга выключены сообщения бота. Напиши ему сам или жди на арене.'),
};

// Приглашение из ссылки принимаем один раз за запуск, даже если экран открыли снова.
let inviteUsed = false;

export function FriendsScreen({ exercise, onBack, onRoom }: { exercise: Exercise; onBack: () => void; onRoom: (code: string, note?: string) => void }) {
  const [data, setData] = useState<FriendsReply | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'guest' | 'offline'>('loading');
  const [note, setNote] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<PlayerMenuTarget | null>(null);

  const apply = (r: FriendsReply) => {
    setData(r);
    setStatus('ready');
    if (r.error) setNote(r.error);
    else if (r.added) setNote(t('{0} теперь твой друг', { 0: r.added }));
    else if (r.requested) setNote(t('Заявка отправлена: {0}', { 0: r.requested }));
    return r;
  };
  const run = (key: string, p: Promise<FriendsReply>) => {
    setBusy(key);
    return p
      .then(apply)
      .catch((e) => {
        if (e instanceof NotTelegram) setStatus('guest');
        else setNote(t('Нет связи с сервером. Попробуй ещё раз'));
        return null;
      })
      .finally(() => setBusy(null));
  };

  useEffect(() => {
    const invite = inviteUsed ? null : friendInviteCode();
    inviteUsed = true;
    void run('load', invite ? friendsApi.add({ invite }) : friendsApi.state()).then((r) => r === null && setStatus((s) => (s === 'guest' ? s : 'offline')));
    // Пока экран открыт, обновляем «в сети» и заявки.
    const id = setInterval(() => document.visibilityState === 'visible' && friendsApi.state().then((r) => setData(r)).catch(() => null), 20_000);
    return () => clearInterval(id);
  }, []);

  const challenge = async (f: FriendView) => {
    if (f.room) return onRoom(f.room);
    const r = await run(f.id, friendsApi.challenge(f.id, exercise));
    if (r?.room) onRoom(r.room, r.note && NOTE_TEXT[r.note]);
  };

  const head = (
    <div className="friends-head">
      <button className="link back" onClick={onBack}>
        {t('‹ Дуэль')}
      </button>
      <h2>
        <Users size={20} /> {t('Друзья')}
      </h2>
      {status === 'ready' && (
        <button className="small-btn ghost" onClick={() => setAdding(true)}>
          <UserPlus size={16} /> {t('Добавить')}
        </button>
      )}
    </div>
  );

  if (status === 'guest')
    return (
      <>
        {head}
        <div className="friends-empty">
          <Users size={34} />
          <b>{t('Друзья — только в Telegram')}</b>
          <div className="muted">{t('Открой NikitenokArena через бота @ArenaNikitenokBot: там видно друзей, их серии и можно вызывать их на дуэль в один тап.')}</div>
        </div>
      </>
    );
  if (status !== 'ready' || !data)
    return (
      <>
        {head}
        <div className="muted center">{status === 'offline' ? t('Нет связи с сервером') : t('Загружаю друзей…')}</div>
      </>
    );

  const online = data.friends.filter((f) => f.online).length;
  return (
    <>
      {head}
      {note && (
        <button className="friends-note" onClick={() => setNote(null)}>
          {note}
        </button>
      )}

      <RefCard refs={data.referrals} onInvite={() => setAdding(true)} />

      {data.incoming.length > 0 && (
        <>
          <div className="section-title">{t('Заявки в друзья')}</div>
          <div className="friend-list">
            {data.incoming.map((r) => (
              <div key={r.id} className="friend request">
                <div className="friend-main">
                  <span className={`friend-name ${r.pro ? 'pro-name' : ''}`}>{r.name}</span>
                  <span className="muted">{t('{0} ур. героя · хочет дружить', { 0: r.level })}</span>
                </div>
                <button className="small-btn" disabled={!!busy} onClick={() => run(r.id, friendsApi.answer(r.id, true))}>
                  <Check size={15} /> {t('Принять')}
                </button>
                <button className="small-btn ghost icon-only" aria-label={t('Отклонить')} disabled={!!busy} onClick={() => run(r.id, friendsApi.answer(r.id, false))}>
                  <Cross size={15} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">
        <span>
          {t('Друзья')} <span className="muted">{data.friends.length}/100</span>
        </span>
        {data.friends.length > 0 && <span className="muted">{t('{0} в сети', { 0: online })}</span>}
      </div>
      {data.friends.length === 0 ? (
        <div className="friends-empty">
          <Users size={34} />
          <b>{t('Пока никого')}</b>
          <div className="muted">{t('Позови друга по ссылке: увидите серии друг друга, а на дуэль сможете вызывать в один тап.')}</div>
          <button className="primary" onClick={() => setAdding(true)}>
            {t('Пригласить друга')}
          </button>
        </div>
      ) : (
        <div className="friend-list">
          {data.friends.map((f) => (
            <FriendRow key={f.id} f={f} exercise={exercise} busy={busy === f.id} onChallenge={() => challenge(f)} onRemove={() => run(`rm${f.id}`, friendsApi.remove(f.id))} onMenu={() => setMenu({ id: f.id, name: f.name, where: 'friend' })} />
          ))}
        </div>
      )}

      {data.outgoing.length > 0 && (
        <div className="friends-outgoing muted">
          {t('Ждут ответа:{0}', { 0: ' ' })}
          {data.outgoing.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ', '}
              {r.name}{' '}
              <button className="link inline" onClick={() => run(`rm${r.id}`, friendsApi.remove(r.id))}>
                {t('отменить')}
              </button>
            </span>
          ))}
        </div>
      )}

      <label className="toggle-row">
        <div>
          <div className="toggle-title">{t('Бот пишет о друзьях')}</div>
          <div className="muted">{t('Вызовы на дуэль, заявки и «вы теперь друзья». С 22:00 до 9:00 по Москве бот молчит.')}</div>
        </div>
        <input type="checkbox" className="switch" checked={data.notify} disabled={busy === 'notify'} onChange={(e) => run('notify', friendsApi.notify(e.target.checked))} />
      </label>

      {menu && (
        <PlayerMenu target={menu} onBlocked={() => void run('state', friendsApi.state())} onClose={() => setMenu(null)}>
          {menu.where === 'friend' && <GiftTrial id={menu.id} name={menu.name} />}
          {menu.where === 'friend' && <GiftPro id={menu.id} name={menu.name} onDone={() => void run('state', friendsApi.state())} />}
        </PlayerMenu>
      )}
      {adding && <AddFriendSheet data={data} busy={busy === 'add'} onAdd={(code) => run('add', friendsApi.add({ code })).then((r) => r && !r.error && setAdding(false))} onClose={() => setAdding(false)} />}
    </>
  );
}

/** «Приведи друга»: награды за друзей, пришедших по ссылке, и за то, что пришёл сам. */
function RefCard({ refs, onInvite }: { refs: FriendsState['referrals']; onInvite: () => void }) {
  const [p, setP] = useState(loadProgress);
  const [got, setGot] = useState<string | null>(null);
  if (!refs) return null;
  const pending = refPending(refs, p);
  const count = refCount(p);
  const waiting = refs.brought.filter((r) => !r.active);
  const claim = (r: RefReward) => {
    const res = claimRef(loadProgress(), r);
    setP(saveProgress(res.progress));
    const outfits = res.outfits.map((id) => `«${itemById(id).name}»`).join(t(' и '));
    setGot([res.coins ? t('+{0} монет', { 0: res.coins }) : '', outfits ? t('облик {0}', { 0: outfits }) : ''].filter(Boolean).join(t(' и ')) || t('Засчитано!'));
  };
  return (
    <div className="ref-card">
      <div className="ref-head">
        <span className="ref-emoji">🤝</span>
        <span>
          <b>{t('Приведи друга')}</b>
          <small>
            {t('Друг пришёл по твоей ссылке и провёл первый бой — тебе {0} монет, ему {1}, обоим облик «Побратим». За {2} друзей — легендарный «Вожак стаи».', { 0: REF_COINS, 1: INVITED_COINS, 2: REF_LEADER_AT })}
          </small>
        </span>
      </div>
      <div className="ref-bar">
        <div style={{ width: `${Math.min(100, (count / REF_LEADER_AT) * 100)}%` }} />
        <span>
          {t('{0} из {1}', { 0: Math.min(count, REF_LEADER_AT), 1: REF_LEADER_AT })}
        </span>
      </div>
      {pending.map((r) => (
        <button key={r.key} className="small-btn ref-claim" onClick={() => claim(r)}>
          🎁 {r.self ? t('Награда за приглашение от {0}', { 0: r.name }) : t('{0} в деле — забрать награду', { 0: r.name })}
        </button>
      ))}
      {got && <div className="ref-got">{got}</div>}
      {refs.by && !refs.me && <div className="muted">{t('Тебя позвал {0}: проведи первый бой — и вы оба получите награду.', { 0: refs.by.name })}</div>}
      {waiting.length > 0 && <div className="muted">{t('Ждём первый бой: {0}', { 0: waiting.map((r) => r.name).join(', ') })}</div>}
      <button className="secondary" onClick={onInvite}>
        {t('Позвать друга по ссылке')}
      </button>
    </div>
  );
}

/** Подарить другу 3 дня Pro бесплатно: можно с Pro, раз в сезон, другу, который Pro ещё не пробовал. */
function GiftTrial({ id, name }: { id: string; name: string }) {
  const offer = useProOffer();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!offer?.trial?.canGive && !note) return null;
  const give = async () => {
    setBusy(true);
    setNote(null);
    try {
      await giftTrial(id);
      setNote(t('Готово! У {0} три дня Pro — бот напишет {1}, от кого подарок.', { 0: name, 1: name }));
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {offer?.trial?.canGive && (
        <button className="pass-buy ghost" disabled={busy} onClick={give}>
          {t('🎁 Подарить 3 дня Pro бесплатно')}
        </button>
      )}
      <div className="pass-buy-note">{note ?? t('Подарок от твоего Pro: один раз в сезон. Друг попробует золотые награды, заморозку серии и бонус опыта.')}</div>
    </>
  );
}

/** Подарить другу Pro Pass за звёзды: платит этот игрок, Pro получает друг, бот скажет ему, от кого подарок. */
function GiftPro({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const offer = useProOffer();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!offer) return null;
  const gift = async () => {
    if (platform !== 'tg') return openPassInTelegram('friends');
    setBusy(true);
    setNote(null);
    // Своего Pro подарок не меняет, ждать сервер не нужно: у друга золотое имя появится, когда сервер узнает об оплате.
    const r = await payStars('gift', null, id);
    setBusy(false);
    if (r === 'done' || r === 'late') {
      setNote(t('Подарок отправлен! Бот напишет {0}, от кого он.', { 0: name }));
      setTimeout(onDone, 3000);
    } else if (r !== 'cancelled') setNote(r.error);
  };
  return (
    <>
      <button className="pass-buy primary" disabled={busy} onClick={gift}>
        {platform === 'tg' ? t('Подарить Pro Pass') : t('Подарить Pro в Telegram')}
        <span className="btn-cost">
          {offer.price} <Star size={13} />
        </span>
      </button>
      <div className="pass-buy-note">{note ?? t('Pro на сезон: золотая дорожка пропуска и золотое имя. Если у друга Pro уже есть, подарок продлит его на следующий сезон.')}</div>
    </>
  );
}

function FriendRow({ f, exercise, busy, onChallenge, onRemove, onMenu }: { f: FriendView; exercise: Exercise; busy: boolean; onChallenge: () => void; onRemove: () => void; onMenu: () => void }) {
  const [open, setOpen] = useState(false);
  const [sure, setSure] = useState(false);
  const league = leagueOf(f.cups);
  const wait = f.waitMs ? Math.ceil(f.waitMs / 60_000) : 0;
  return (
    <div className="friend">
      <button className="friend-main" onClick={() => setOpen(!open)}>
        <span className="friend-line">
          <span className={`dot ${f.online ? 'on' : ''}`} />
          <span className={`friend-name ${f.pro ? 'pro-name' : ''}`}>{f.name}</span>
          {f.clanTag && <span className="friend-tag">[{f.clanTag}]</span>}
          <span className="friend-level">{t('{0} ур.', { 0: f.level })}</span>
        </span>
        <span className="friend-meta">
          <span style={{ color: league.color }}>{league.name}</span> {t('· {0} куб.', { 0: f.cups })}
          {f.streak > 0 && (
            <span className="friend-streak">
              {' '}
              · <Flame size={12} /> {f.streak}
            </span>
          )}
        </span>
        <span className="friend-meta">{f.online ? t('в игре сейчас') : lastDayText(f.lastDay)}</span>
      </button>
      <button className={`small-btn friend-call ${f.room ? 'ghost' : ''}`} disabled={busy || (!f.room && wait > 0)} onClick={onChallenge} aria-label={t('Вызвать {0}: {1}', { 0: f.name, 1: EXERCISE_LABELS[exercise] })}>
        {f.room ? (
          t('В комнату')
        ) : wait > 0 ? (
          t('через {0} мин', { 0: wait })
        ) : (
          <>
            <Swords size={15} /> {t('Вызвать')}
          </>
        )}
      </button>
      {open && (
        <div className="friend-actions">
          <span className="muted">{t('Вызов: {0} — упражнение выбирается вверху', { 0: EXERCISE_LABELS[exercise].toLowerCase() })}</span>
          <button className="small-btn danger" onClick={() => (sure ? onRemove() : setSure(true))}>
            {sure ? t('Точно удалить?') : t('Удалить из друзей')}
          </button>
          <button className="small-btn ghost" onClick={onMenu}>
            {t('Пожаловаться или заблокировать')}
          </button>
        </div>
      )}
    </div>
  );
}

function AddFriendSheet({ data, busy, onAdd, onClose }: { data: FriendsReply; busy: boolean; onAdd: (code: string) => void; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [shared, setShared] = useState<string | null>(null);
  const link = friendInviteLink(data.invite, data.bot);
  const invite = async () => {
    const how = await share(link, t('Давай дружить в NikitenokArena: будем вызывать друг друга на дуэль — кто больше отожмётся за минуту!')).catch(() => null);
    setShared(how === 'copied' ? t('Ссылка скопирована') : null);
  };
  const copyCode = () =>
    navigator.clipboard
      ?.writeText(data.code)
      .then(() => setShared(t('Код скопирован')))
      .catch(() => null);
  return (
    <Sheet onClose={onClose} bodyClassName="add-friend">
      <h3>{t('Добавить друга')}</h3>
      <div className="muted">{t('Отправь другу ссылку: он откроет игру и сразу окажется у тебя в друзьях.')}</div>
      <button className="primary" onClick={invite}>
        <UserPlus size={18} /> {t('Поделиться ссылкой')}
      </button>
      {shared && <div className="muted center">{shared}</div>}
      <div className="my-code">
        <div>
          <div className="muted">{t('Мой код')}</div>
          <b>{data.code}</b>
        </div>
        <button className="small-btn ghost" onClick={copyCode}>
          {t('Скопировать')}
        </button>
      </div>
      <div className="muted">{t('Есть код друга? Введи его — друг получит заявку и примет её.')}</div>
      <div className="join">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder={t('Код друга')} maxLength={6} autoCapitalize="characters" />
        <button disabled={code.length !== 6 || busy} onClick={() => onAdd(code)}>
          {t('Добавить')}
        </button>
      </div>
      {data.error && <div className="muted center warn">{data.error}</div>}
    </Sheet>
  );
}
