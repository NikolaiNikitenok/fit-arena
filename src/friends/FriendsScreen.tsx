// Экран друзей во вкладке «Дуэль»: список, заявки, вызов на дуэль в один тап.
import { useEffect, useState } from 'react';
import type { FriendView } from '../../shared/protocol';
import { leagueOf } from '../../shared/rating';
import { Check, Cross, Flame, Swords, UserPlus, Users } from '../icons';
import { EXERCISE_LABELS, type Exercise } from '../repCounter';
import { friendInviteCode, friendInviteLink, share } from '../telegram';
import { friendsApi, type FriendsReply, lastDayText, NotTelegram } from './api';

const NOTE_TEXT = {
  app: 'Друг в игре — ему пришло приглашение. Ждём его на арене!',
  bot: 'Бот написал другу. Вызов действует 10 минут.',
  quiet: 'Ночью бот не пишет. Друг увидит вызов, если сам откроет игру.',
  off: 'У друга выключены сообщения бота. Напиши ему сам или жди на арене.',
};

// Приглашение из ссылки принимаем один раз за запуск, даже если экран открыли снова.
let inviteUsed = false;

export function FriendsScreen({ exercise, onBack, onRoom }: { exercise: Exercise; onBack: () => void; onRoom: (code: string, note?: string) => void }) {
  const [data, setData] = useState<FriendsReply | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'guest' | 'offline'>('loading');
  const [note, setNote] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const apply = (r: FriendsReply) => {
    setData(r);
    setStatus('ready');
    if (r.error) setNote(r.error);
    else if (r.added) setNote(`${r.added} теперь твой друг`);
    else if (r.requested) setNote(`Заявка отправлена: ${r.requested}`);
    return r;
  };
  const run = (key: string, p: Promise<FriendsReply>) => {
    setBusy(key);
    return p
      .then(apply)
      .catch((e) => {
        if (e instanceof NotTelegram) setStatus('guest');
        else setNote('Нет связи с сервером. Попробуй ещё раз');
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
        ‹ Дуэль
      </button>
      <h2>
        <Users size={20} /> Друзья
      </h2>
      {status === 'ready' && (
        <button className="small-btn ghost" onClick={() => setAdding(true)}>
          <UserPlus size={16} /> Добавить
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
          <b>Друзья — только в Telegram</b>
          <div className="muted">Открой NikitenokArena через бота @ArenaNikitenokBot: там видно друзей, их серии и можно вызывать их на дуэль в один тап.</div>
        </div>
      </>
    );
  if (status !== 'ready' || !data)
    return (
      <>
        {head}
        <div className="muted center">{status === 'offline' ? 'Нет связи с сервером' : 'Загружаю друзей…'}</div>
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

      {data.incoming.length > 0 && (
        <>
          <div className="section-title">Заявки в друзья</div>
          <div className="friend-list">
            {data.incoming.map((r) => (
              <div key={r.id} className="friend request">
                <div className="friend-main">
                  <span className={`friend-name ${r.pro ? 'pro-name' : ''}`}>{r.name}</span>
                  <span className="muted">{r.level} ур. героя · хочет дружить</span>
                </div>
                <button className="small-btn" disabled={!!busy} onClick={() => run(r.id, friendsApi.answer(r.id, true))}>
                  <Check size={15} /> Принять
                </button>
                <button className="small-btn ghost icon-only" aria-label="Отклонить" disabled={!!busy} onClick={() => run(r.id, friendsApi.answer(r.id, false))}>
                  <Cross size={15} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">
        <span>
          Друзья <span className="muted">{data.friends.length}/100</span>
        </span>
        {data.friends.length > 0 && <span className="muted">{online} в сети</span>}
      </div>
      {data.friends.length === 0 ? (
        <div className="friends-empty">
          <Users size={34} />
          <b>Пока никого</b>
          <div className="muted">Позови друга по ссылке: увидите серии друг друга, а на дуэль сможете вызывать в один тап.</div>
          <button className="primary" onClick={() => setAdding(true)}>
            Пригласить друга
          </button>
        </div>
      ) : (
        <div className="friend-list">
          {data.friends.map((f) => (
            <FriendRow key={f.id} f={f} exercise={exercise} busy={busy === f.id} onChallenge={() => challenge(f)} onRemove={() => run(`rm${f.id}`, friendsApi.remove(f.id))} />
          ))}
        </div>
      )}

      {data.outgoing.length > 0 && (
        <div className="friends-outgoing muted">
          Ждут ответа:{' '}
          {data.outgoing.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ', '}
              {r.name}{' '}
              <button className="link inline" onClick={() => run(`rm${r.id}`, friendsApi.remove(r.id))}>
                отменить
              </button>
            </span>
          ))}
        </div>
      )}

      <label className="toggle-row">
        <div>
          <div className="toggle-title">Бот пишет о друзьях</div>
          <div className="muted">Вызовы на дуэль, заявки и «вы теперь друзья». С 22:00 до 9:00 по Москве бот молчит.</div>
        </div>
        <input type="checkbox" className="switch" checked={data.notify} disabled={busy === 'notify'} onChange={(e) => run('notify', friendsApi.notify(e.target.checked))} />
      </label>

      {adding && <AddFriendSheet data={data} busy={busy === 'add'} onAdd={(code) => run('add', friendsApi.add({ code })).then((r) => r && !r.error && setAdding(false))} onClose={() => setAdding(false)} />}
    </>
  );
}

function FriendRow({ f, exercise, busy, onChallenge, onRemove }: { f: FriendView; exercise: Exercise; busy: boolean; onChallenge: () => void; onRemove: () => void }) {
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
          <span className="friend-level">{f.level} ур.</span>
        </span>
        <span className="friend-meta">
          <span style={{ color: league.color }}>{league.name}</span> · {f.cups} куб.
          {f.streak > 0 && (
            <span className="friend-streak">
              {' '}
              · <Flame size={12} /> {f.streak}
            </span>
          )}
        </span>
        <span className="friend-meta">{f.online ? 'в игре сейчас' : lastDayText(f.lastDay)}</span>
      </button>
      <button className={`small-btn friend-call ${f.room ? 'ghost' : ''}`} disabled={busy || (!f.room && wait > 0)} onClick={onChallenge} aria-label={`Вызвать ${f.name}: ${EXERCISE_LABELS[exercise]}`}>
        {f.room ? (
          'В комнату'
        ) : wait > 0 ? (
          `через ${wait} мин`
        ) : (
          <>
            <Swords size={15} /> Вызвать
          </>
        )}
      </button>
      {open && (
        <div className="friend-actions">
          <span className="muted">Вызов: {EXERCISE_LABELS[exercise].toLowerCase()} — упражнение выбирается вверху</span>
          <button className="small-btn danger" onClick={() => (sure ? onRemove() : setSure(true))}>
            {sure ? 'Точно удалить?' : 'Удалить из друзей'}
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
    const how = await share(link, 'Давай дружить в NikitenokArena: будем вызывать друг друга на дуэль — кто больше отожмётся за минуту!').catch(() => null);
    setShared(how === 'copied' ? 'Ссылка скопирована' : null);
  };
  const copyCode = () =>
    navigator.clipboard
      ?.writeText(data.code)
      .then(() => setShared('Код скопирован'))
      .catch(() => null);
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-body add-friend" onClick={(e) => e.stopPropagation()}>
        <h3>Добавить друга</h3>
        <div className="muted">Отправь другу ссылку: он откроет игру и сразу окажется у тебя в друзьях.</div>
        <button className="primary" onClick={invite}>
          <UserPlus size={18} /> Поделиться ссылкой
        </button>
        {shared && <div className="muted center">{shared}</div>}
        <div className="my-code">
          <div>
            <div className="muted">Мой код</div>
            <b>{data.code}</b>
          </div>
          <button className="small-btn ghost" onClick={copyCode}>
            Скопировать
          </button>
        </div>
        <div className="muted">Есть код друга? Введи его — друг получит заявку и примет её.</div>
        <div className="join">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="Код друга" maxLength={6} autoCapitalize="characters" />
          <button disabled={code.length !== 6 || busy} onClick={() => onAdd(code)}>
            Добавить
          </button>
        </div>
        {data.error && <div className="muted center warn">{data.error}</div>}
        <button className="link" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
