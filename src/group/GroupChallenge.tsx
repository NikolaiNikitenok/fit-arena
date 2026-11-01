// Вызов в групповом чате (server/groupChallenges.ts): игрок добавляет бота в семейный или рабочий чат,
// бот ведёт там таблицу «кто больше за неделю». Здесь — кнопка «Вызов в чат», вступление по кнопке
// «Участвовать» из чата и карточка «Мои вызовы» с местом в таблице.
import { useEffect, useState } from 'react';
import { post } from '../cloud';
import { Sheet } from '../Sheet';
import { EXERCISE_LABELS, type RepExercise, REP_EXERCISES } from '../repCounter';
import { groupChallengeCode, openGroupChallenge, platform } from '../telegram';
import { track } from '../telemetry';
import { t } from '../i18n';
import './group.css';

export interface GroupView {
  id: string;
  title: string;
  exercise: RepExercise;
  endsAt: number;
  rows: { id: string; name: string; reps: number }[];
  me: string;
}

const left = (endsAt: number) => {
  const ms = Math.max(0, endsAt - Date.now());
  return ms >= 86_400_000 ? t('ещё {0} дн.', { 0: Math.ceil(ms / 86_400_000) }) : t('ещё {0} ч', { 0: Math.max(1, Math.ceil(ms / 3_600_000)) });
};

function Table({ g }: { g: GroupView }) {
  return (
    <ol className="gc-table">
      {g.rows.map((r, i) => (
        <li key={r.id} className={r.id === g.me ? 'me' : ''}>
          <span className="gc-place">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
          <span className="gc-name">{r.name}</span>
          <b>{r.reps}</b>
        </li>
      ))}
    </ol>
  );
}

// Код из ссылки обрабатываем один раз за запуск, даже если экран перерисуется.
let joinUsed = false;

/** Пришёл по кнопке «Участвовать»: вступаем и показываем таблицу. */
export function GroupJoin({ onTrain }: { onTrain: () => void }) {
  const [code] = useState(() => (joinUsed ? null : groupChallengeCode()));
  const [g, setG] = useState<GroupView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!code) return;
    joinUsed = true;
    post('/api/group/join', { id: code })
      .then((r) => {
        setG((r as { challenge: GroupView }).challenge);
        track('group_join', 'ok');
      })
      .catch((e: { body?: { error?: string } }) => {
        setError(e?.body?.error ?? t('Нет связи с сервером. Попробуй ещё раз'));
        track('group_join', 'fail');
      });
  }, [code]);
  if (!code || (!g && !error)) return null;
  const close = () => {
    setG(null);
    setError(null);
  };
  return (
    <Sheet onClose={close}>
      <div className="gc-sheet">
        {g ? (
          <>
            <div className="level-title">{t('Ты в вызове чата!')}</div>
            <div className="muted">
              {t('«{0}»: кто больше — {1} — за неделю, {2}. Засчитываются повторы из любого режима игры, таблица обновляется в чате сама.', { 0: g.title || t('Чат'), 1: t(EXERCISE_LABELS[g.exercise]).toLowerCase(), 2: left(g.endsAt) })}
            </div>
            <Table g={g} />
            <button
              className="primary"
              onClick={() => {
                close();
                onTrain();
              }}
            >
              {t('Тренироваться')}
            </button>
          </>
        ) : (
          <>
            <div className="level-title">{t('Вызов чата')}</div>
            <div className="muted">{error}</div>
            <button className="primary" onClick={close}>
              {t('Понятно')}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Карточка «Вызов в чат»: выбрать упражнение и добавить бота в группу; ниже — свои идущие вызовы. */
export function GroupCard() {
  const [picking, setPicking] = useState(false);
  const [mine, setMine] = useState<GroupView[]>([]);
  useEffect(() => {
    if (platform !== 'tg') return;
    post('/api/group/state', {})
      .then((r) => setMine((r as { challenges: GroupView[] }).challenges ?? []))
      .catch(() => null);
  }, []);
  // Вызов ведёт бот Telegram: в браузере и в Max кнопки нет.
  if (platform !== 'tg') return null;
  return (
    <div className="gc-card">
      <div className="gc-head">
        <span className="gc-emoji">🏆</span>
        <span>
          <b>{t('Вызов в чат')}</b>
          <small>{t('Кто больше отожмётся за неделю? Добавь бота в семейный или рабочий чат — он сам ведёт таблицу прямо там.')}</small>
        </span>
      </div>
      {mine.map((g) => {
        const place = g.rows.findIndex((r) => r.id === g.me) + 1;
        return (
          <div key={g.id} className="gc-mine">
            <b>{g.title || t('Чат')}</b>
            <span>{t('{0} · место {1} из {2} · {3}', { 0: t(EXERCISE_LABELS[g.exercise]), 1: place || '—', 2: g.rows.length, 3: left(g.endsAt) })}</span>
          </div>
        );
      })}
      <button className="secondary" onClick={() => setPicking(true)}>
        {t('Бросить вызов в чат')}
      </button>
      {picking && (
        <Sheet onClose={() => setPicking(false)}>
          <div className="gc-sheet">
            <div className="level-title">{t('Какое упражнение?')}</div>
            <div className="muted">{t('Telegram предложит выбрать чат. Бот опубликует таблицу на 7 дней и будет обновлять её сам.')}</div>
            {REP_EXERCISES.map((ex) => (
              <button
                key={ex}
                className="secondary"
                onClick={() => {
                  track('group_create', ex);
                  openGroupChallenge(ex);
                  setPicking(false);
                }}
              >
                {t(EXERCISE_LABELS[ex])}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
