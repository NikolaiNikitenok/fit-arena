import { phraseOfDay, phraseOfHour, randomPhrase } from './phrases.js';
import { PRESETS, EMOJIS, MILESTONES, HEALTH, TRIGGERS, TRIGGER_TIPS, ACTIVITIES, GROUPS, MOODS, REASON_IDEAS, HELPLINES, BADGES } from './data.js';
import { $, $$, esc, pad, uid, DAY, money, num, dayKey, plural, parts, shortDur, atLabel, fmtDate, fmtTime, localInput, vibrate, toast, confetti, sheet, ask } from './util.js';
import { S, save, replaceState, resetState, findHabit, elapsed, isPlanned, savedOf, savedTotal, checkStreak, logCraving, checkBadges, cravingStats, suggestActivities } from './store.js';
import { openActivity } from './activities.js';
import { shareProgress } from './share.js';
import { account, onAccount, loginFromHash, loginFromNid, loginWithNid, hasNidReturn, pull, push, logout, status as syncStatus, FAMILY_LOGIN } from './cloud.js';

const trig = (k) => TRIGGERS.find((t) => t.key === k);
const act = (k) => ACTIVITIES.find((a) => a.key === k);
const habitNames = () => S.habits.map((h) => h.name.toLowerCase()).join(', ');

function nextMilestone(ms) {
  const next = MILESTONES.find((m) => m.at > ms);
  const prev = [...MILESTONES].reverse().find((m) => m.at <= ms);
  if (!next) return { next: null, pct: 1, prev };
  const from = prev ? prev.at : 0;
  return { next, prev, pct: (ms - from) / (next.at - from) };
}
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

// ---------- Маршруты ----------
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('h/')) return { name: 'habit', id: h.slice(2) };
  if (['distract', 'progress', 'motivation'].includes(h)) return { name: h };
  return { name: 'home' };
}
window.addEventListener('hashchange', () => render(true));

function render(scrollTop = false) {
  if (!S.onboarded) { $('#main').innerHTML = ''; if (!$('.onboard')) onboarding(); return; }
  const r = route();
  const main = $('#main');
  const views = { home: homeView, distract: distractView, progress: progressView, motivation: motivationView };
  if (r.name === 'habit') {
    const h = findHabit(r.id);
    main.innerHTML = h ? habitView(h) : homeView();
  } else main.innerHTML = views[r.name]();
  $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === (r.name === 'habit' ? 'home' : r.name)));
  main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter');
  tick();
  if (scrollTop) window.scrollTo(0, 0);
}

// ---------- Главная ----------
function homeView() {
  const today = S.checkins[dayKey()];
  const hour = new Date().getHours();
  const active = S.habits.filter((h) => !isPlanned(h));
  const total = savedTotal();
  const lastBadge = Object.entries(S.badges).sort((a, b) => b[1] - a[1])[0];
  const lb = lastBadge && BADGES.find((b) => b.id === lastBadge[0]);
  return `
    <section class="hello">
      <div><h1>${greeting()}!</h1><p class="muted">${(() => { const t = fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' }); return t[0].toUpperCase() + t.slice(1); })()}</p></div>
      ${checkStreak() ? `<div class="streak-pill" title="Отметок подряд">📅 ${checkStreak()}</div>` : ''}
    </section>

    ${!today ? `
    <section class="card checkin">
      <h3>Как ты сегодня?</h3>
      <div class="moods">${MOODS.map((m) => `<button class="mood" data-act="mood" data-v="${m.v}"><span>${m.emoji}</span><small>${m.name}</small></button>`).join('')}</div>
    </section>` : !today.pledge && active.length ? `
    <section class="card checkin glow">
      <h3>Обещание на сегодня</h3>
      <p class="muted">Скажи себе: «Сегодня я без: ${esc(habitNames())}». Только на сегодня — этого достаточно.</p>
      <button class="btn primary wide" data-act="pledge">🤝 Обещаю себе</button>
    </section>` : `
    <section class="card checkin done-ci">
      <span class="ci-mood">${MOODS.find((m) => m.v === today.mood)?.emoji || '🙂'}</span>
      <div><b>${hour >= 20 ? 'День почти засчитан!' : today.pledge ? 'Обещание дано' : 'Отметка есть'}</b>
      <small class="muted">${hour >= 20 ? 'Ещё немного — и ещё один день свободы.' : 'Держись — вечером подведём итог.'}</small></div>
    </section>`}

    <section class="phrase card glow">
      <div class="label">Фраза часа <button class="icon-btn" data-act="share-phrase" aria-label="Поделиться">↗</button></div>
      <p data-hour-phrase>${esc(phraseOfHour())}</p>
    </section>

    <button class="sos" data-act="sos">
      <span class="sos-icon">🆘</span>
      <span><b>Хочется сорваться?</b><small>Нажми — переждём тягу вместе</small></span>
      <span class="sos-arrow">→</span>
    </button>

    ${S.habits.length ? `<div class="list">${S.habits.map(habitCard).join('')}</div>` : `
      <section class="empty card">
        <div class="big-emoji">🌱</div>
        <h2>Нет привычек</h2>
        <p class="muted">Добавь привычку, от которой отказываешься, — таймер начнёт считать твоё время свободы.</p>
      </section>`}
    <button class="btn ghost wide dashed" data-act="add">＋ Добавить привычку</button>

    ${total >= 1 || S.goal ? goalCard(total) : ''}

    ${lb ? `<a class="card badge-strip" href="#/progress"><span class="badge-emoji">${lb.emoji}</span><div><b>${lb.title}</b><small class="muted">Последняя награда · всего ${Object.keys(S.badges).length} из ${BADGES.length}</small></div><span class="chev">›</span></a>` : ''}
  `;
}

function habitCard(h) {
  if (isPlanned(h)) {
    return `<a class="habit card planned" href="#/h/${h.id}">
      <div class="habit-top"><span class="emoji">${esc(h.emoji)}</span>
        <div class="habit-name">${esc(h.name)}<small>старт ${fmtDate(h.start, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</small></div></div>
      <div class="countdown">До старта: <b data-countdown="${h.id}">${shortDur(h.start - Date.now())}</b></div>
      <p class="muted tiny">Подготовься: убери всё, что напоминает о привычке, и выбери, чем заменишь её.</p>
    </a>`;
  }
  const ms = elapsed(h);
  const { next, pct } = nextMilestone(ms);
  return `
    <a class="habit card" href="#/h/${h.id}">
      <div class="habit-top">
        <span class="emoji">${esc(h.emoji)}</span>
        <div class="habit-name">${esc(h.name)}<small>свободен уже</small></div>
        ${h.cravings ? `<span class="wins-pill">💪 ${h.cravings}</span>` : ''}
      </div>
      <div class="timer" data-timer="${h.id}">${timerHtml(ms)}</div>
      <div class="bar"><i style="width:${(pct * 100).toFixed(1)}%" data-bar="${h.id}"></i></div>
      <div class="habit-foot">
        <span>${next ? `До «${next.title}»: <b data-left="${h.id}">${shortDur(next.at - ms)}</b>` : 'Все этапы пройдены 🏆'}</span>
        ${h.costPerDay ? `<span class="saved" data-saved="${h.id}">+${money(savedOf(h))}</span>` : ''}
      </div>
    </a>`;
}
function timerHtml(ms) {
  const p = parts(ms);
  return `<span><b>${p.d}</b><small>${plural(p.d, 'день', 'дня', 'дней')}</small></span>
    <span><b>${pad(p.h)}</b><small>час</small></span>
    <span><b>${pad(p.m)}</b><small>мин</small></span>
    <span><b>${pad(p.s)}</b><small>сек</small></span>`;
}
function goalCard(total) {
  if (!S.goal) {
    return `<section class="card goal">
      <div class="goal-head"><span class="goal-emoji">🐷</span><div><b data-saved-total>${money(total)}</b><small class="muted">сэкономлено всего</small></div></div>
      <button class="btn ghost small" data-act="goal">🎯 Поставить цель: на что копишь?</button>
    </section>`;
  }
  const pct = Math.min(1, total / S.goal.price);
  const perDay = S.habits.reduce((s, h) => s + (isPlanned(h) ? 0 : h.costPerDay), 0);
  const daysLeft = perDay ? Math.ceil((S.goal.price - total) / perDay) : null;
  return `<section class="card goal" data-act="goal">
    <div class="goal-head"><span class="goal-emoji">${pct >= 1 ? '🎉' : '🎯'}</span>
      <div><b>${esc(S.goal.title)}</b><small class="muted"><span data-saved-total>${money(total)}</span> из ${money(S.goal.price)}</small></div>
      <span class="goal-pct" data-goal-pct>${Math.floor(pct * 100)}%</span></div>
    <div class="bar gold"><i style="width:${(pct * 100).toFixed(1)}%" data-goal-bar></i></div>
    <small class="muted">${pct >= 1 ? 'Цель достигнута! Купи себе это — ты заслужил.' : daysLeft ? `Ещё примерно ${daysLeft} ${plural(daysLeft, 'день', 'дня', 'дней')} без привычки` : 'Укажи траты в день у привычки, чтобы копилка росла'}</small>
  </section>`;
}

// ---------- Привычка ----------
function habitView(h) {
  const planned = isPlanned(h);
  const ms = elapsed(h);
  const best = Math.max(h.best || 0, ms);
  const health = HEALTH[h.preset] || [];
  const help = HELPLINES[h.preset];
  const myCravings = S.cravings.filter((c) => c.habitId === h.id);
  const topTrig = Object.entries(myCravings.reduce((m, c) => (c.trigger ? ((m[c.trigger] = (m[c.trigger] || 0) + 1), m) : m), {})).sort((a, b) => b[1] - a[1])[0];
  return `
    <a class="back" href="#/">← Назад</a>
    <section class="hero card glow">
      <div class="big-emoji">${esc(h.emoji)}</div>
      <h1>${esc(h.name)}</h1>
      ${planned ? `
        <p class="muted">Старт ${fmtDate(h.start, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
        <div class="countdown big">До старта: <b data-countdown="${h.id}">${shortDur(h.start - Date.now())}</b></div>
        <button class="btn primary wide" data-act="start-now" data-id="${h.id}">Начать прямо сейчас</button>` : `
        <p class="muted">Свободен с ${fmtDate(h.start, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
        <div class="timer big" data-timer="${h.id}">${timerHtml(ms)}</div>`}
    </section>
    ${planned ? `
    <section class="card">
      <h3>Как подготовиться</h3>
      <ul class="prep">
        <li>🧹 Убери из дома и сумки всё, что связано с привычкой</li>
        <li>📝 Запиши причины во вкладке «Мотивация»</li>
        <li>🤝 Скажи близким о дне старта — поддержка помогает</li>
        <li>🧩 Посмотри «Отвлечься» и выбери 2–3 занятия на трудный момент</li>
        ${(h.triggers || []).map((t) => `<li>${trig(t)?.emoji || '❔'} ${esc(TRIGGER_TIPS[t] || '')}</li>`).join('')}
      </ul>
    </section>` : `
    <div class="stats">
      ${h.costPerDay ? `<div class="stat card"><span class="stat-ico">💰</span><b data-saved="${h.id}">${money(savedOf(h))}</b><small>сэкономлено</small></div>` : ''}
      ${h.perDay ? `<div class="stat card"><span class="stat-ico">🚫</span><b data-avoided="${h.id}">${num((h.perDay * ms) / DAY)}</b><small>${esc(h.unit || 'раз')} не случилось</small></div>` : ''}
      <div class="stat card"><span class="stat-ico">💪</span><b>${h.cravings || 0}</b><small>${plural(h.cravings || 0, 'победа', 'победы', 'побед')} над тягой</small></div>
      <div class="stat card"><span class="stat-ico">🏆</span><b>${shortDur(best)}</b><small>лучшая серия</small></div>
    </div>
    <div class="row">
      <button class="btn primary" data-act="sos" data-id="${h.id}">💪 Хочется — помоги</button>
      <button class="btn ghost" data-act="relapse" data-id="${h.id}">Я сорвался</button>
    </div>
    <button class="btn ghost wide" data-act="share" data-id="${h.id}">↗ Поделиться успехом</button>
    ${topTrig ? `<section class="card insight"><span>${trig(topTrig[0])?.emoji}</span><div><b>Чаще всего тянет: ${trig(topTrig[0])?.name.toLowerCase()}</b><small class="muted">${esc(TRIGGER_TIPS[topTrig[0]])}</small></div></section>` : ''}
    <section class="card">
      <h3>Этапы</h3>
      <ul class="milestones">
        ${MILESTONES.map((m) => {
          const done = ms >= m.at;
          return `<li class="${done ? 'done' : ''}"><span class="dot">${done ? '✓' : ''}</span><div><b>${m.title}</b><small>${done ? m.text : 'осталось ' + shortDur(m.at - ms)}</small></div></li>`;
        }).join('')}
      </ul>
    </section>
    ${health.length ? `<section class="card">
      <h3>Что происходит с телом</h3>
      <ul class="milestones">
        ${health.map((x) => `<li class="${ms >= x.at ? 'done' : ''}"><span class="dot">${ms >= x.at ? '✓' : ''}</span><div><b>${atLabel(x.at)}</b><small>${x.text}</small></div></li>`).join('')}
      </ul>
      <p class="muted tiny">Общие сведения, не медицинская консультация.</p>
    </section>` : ''}
    ${(h.slips?.length || h.relapses?.length) ? `<section class="card">
      <h3>История</h3>
      <ul class="history">
        ${[...(h.relapses || []).map((r) => ({ ...r, kind: 'relapse' })), ...(h.slips || []).map((r) => ({ ...r, kind: 'slip' }))].sort((a, b) => b.t - a.t).slice(0, 8).map((r) =>
          `<li><span>${r.kind === 'slip' ? '🟡' : '🔴'}</span><div><b>${r.kind === 'slip' ? 'Оступился' : 'Новый старт'}</b><small class="muted">${fmtDate(r.t, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${r.trigger ? ' · ' + trig(r.trigger)?.name.toLowerCase() : ''}${r.note ? ' · ' + esc(r.note) : ''}</small></div></li>`).join('')}
      </ul>
      <p class="muted tiny">Каждый новый старт — тоже шаг вперёд.</p>
    </section>` : ''}
    ${help ? `<a class="card helpline" href="tel:${help.phone}"><span>📞</span><div><b>${help.name}</b><small class="muted">${help.label} · бесплатно по России</small></div></a>` : ''}`}
    <div class="row">
      <button class="btn ghost" data-act="edit" data-id="${h.id}">Изменить</button>
      <button class="btn ghost danger" data-act="delete" data-id="${h.id}">Удалить</button>
    </div>
  `;
}

// ---------- Отвлечься ----------
function distractView() {
  const tile = (a) => `<button class="tile card" data-act="activity" data-key="${a.key}">
    <span class="tile-emoji">${a.emoji}</span><b>${a.title}</b><small>${a.text}</small>${S.best[a.key] ? `<i class="tile-best">🏆 ${S.best[a.key]}${a.key === 'reaction' ? ' мс' : ''}</i>` : ''}</button>`;
  return `
    <h1 class="page-title">Отвлечься</h1>
    <p class="muted">Тяга обычно длится 3–5 минут. Выбери, чем занять это время, — или дай выбрать нам.</p>
    <button class="btn primary wide big-btn" data-act="random">🎲 Мне скучно — выбери за меня</button>
    ${GROUPS.map((g) => `<h3 class="group-title">${g.title}</h3>
      <div class="grid">${ACTIVITIES.filter((a) => a.group === g.key).map(tile).join('')}</div>`).join('')}
    ${S.contact ? `<a class="card helpline" href="tel:${esc(S.contact.phone)}"><span>📞</span><div><b>Позвонить: ${esc(S.contact.name)}</b><small class="muted">Разговор с близким отвлекает лучше всего</small></div></a>` : ''}
  `;
}

// ---------- Прогресс ----------
function progressView() {
  const st = cravingStats(14);
  const total = savedTotal();
  const maxDay = Math.max(1, ...st.byDay.map((d) => d.n));
  const maxH = Math.max(1, ...st.hours);
  const rate = st.total ? Math.round((st.won / st.total) * 100) : null;
  // Календарь отметок: 4 недели с понедельника, текущая неделя последняя.
  const cal = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 21);
  const todayK = dayKey();
  for (let i = 0; i < 28; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = dayKey(d);
    const c = S.checkins[k];
    const future = d > new Date();
    cal.push(`<span class="cal-day ${c ? 'has' : ''} ${k === todayK ? 'today' : ''} ${future ? 'future' : ''}" title="${fmtDate(d)}">${c ? MOODS.find((m) => m.v === c.mood)?.emoji || '✓' : d.getDate()}</span>`);
  }
  return `
    <h1 class="page-title">Прогресс</h1>
    <div class="stats">
      <div class="stat card"><span class="stat-ico">💪</span><b>${S.wins}</b><small>${plural(S.wins, 'победа', 'победы', 'побед')} над тягой</small></div>
      <div class="stat card"><span class="stat-ico">🎯</span><b>${rate == null ? '—' : rate + '%'}</b><small>тяги побеждено за 2 недели</small></div>
      <div class="stat card"><span class="stat-ico">💰</span><b data-saved-total>${money(total)}</b><small>сэкономлено всего</small></div>
      <div class="stat card"><span class="stat-ico">📅</span><b>${checkStreak()}</b><small>${plural(checkStreak(), 'день', 'дня', 'дней')} отметок подряд</small></div>
    </div>

    ${goalCard(total)}

    <section class="card">
      <h3>Тяга за 2 недели</h3>
      ${st.total ? `<div class="chart">${st.byDay.map((d) => `<div class="col" title="${fmtDate(d.d)}: ${d.n}">
          <div class="stack" style="height:${(d.n / maxDay) * 100}%"><i class="lost" style="flex:${d.n - d.won}"></i><i class="won" style="flex:${d.won}"></i></div>
          <small>${d.d.getDate()}</small></div>`).join('')}</div>
        <div class="legend"><span><i class="won"></i>справился</span><span><i class="lost"></i>сорвался</span></div>
        ${st.avgDrop ? `<p class="insight-line">📉 После занятий тяга падает в среднем на <b>${st.avgDrop.toFixed(1)}</b> из 10</p>` : ''}
        ${st.bestActivity ? `<p class="insight-line">${act(st.bestActivity)?.emoji} Лучше всего помогает: <b>${act(st.bestActivity)?.title}</b></p>` : ''}`
      : `<p class="muted">Здесь появится график, когда ты первый раз нажмёшь «Хочется сорваться?». Так ты увидишь, как тяга становится реже.</p>`}
    </section>

    ${st.total ? `<section class="card">
      <h3>Когда тянет</h3>
      <div class="hours-map">${st.hours.map((n, h) => `<i style="opacity:${0.12 + (n / maxH) * 0.88}" title="${pad(h)}:00 — ${n}"></i>`).join('')}</div>
      <div class="hours-axis"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
      ${st.peakHour != null ? `<p class="insight-line">⏰ Пик тяги около <b>${pad(st.peakHour)}:00</b>. Запланируй на это время занятие заранее.</p>` : ''}
      ${st.triggers.length ? `<h3 class="mt">Что провоцирует</h3>
        <ul class="trig-bars">${st.triggers.slice(0, 5).map(([k, n]) => `<li><span>${trig(k)?.emoji} ${trig(k)?.name}</span><div class="bar"><i style="width:${(n / st.triggers[0][1]) * 100}%"></i></div><b>${n}</b></li>`).join('')}</ul>
        <p class="insight-line">💡 ${esc(TRIGGER_TIPS[st.triggers[0][0]])}</p>` : ''}
    </section>` : ''}

    <section class="card">
      <h3>Настроение по дням</h3>
      <div class="cal">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => `<small>${d}</small>`).join('')}${cal.join('')}</div>
    </section>

    <section class="card">
      <h3>Награды <span class="muted">${Object.keys(S.badges).length}/${BADGES.length}</span></h3>
      <div class="badges">${BADGES.map((b) => `<button class="badge ${S.badges[b.id] ? 'got' : ''}" data-act="badge" data-id="${b.id}"><span>${b.emoji}</span><small>${b.title}</small></button>`).join('')}</div>
    </section>
  `;
}

// ---------- Мотивация ----------
function motivationView() {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  return `
    <h1 class="page-title">Мотивация</h1>
    <section class="phrase card glow">
      <div class="label">Фраза дня <button class="icon-btn" data-act="share-phrase" data-day="1" aria-label="Поделиться">↗</button></div>
      <p>${esc(phraseOfDay())}</p>
    </section>
    <section class="phrase card">
      <div class="label">Ещё одна</div>
      <p id="rnd">${esc(randomPhrase())}</p>
      <button class="btn ghost small" data-act="rnd">Другая фраза ↻</button>
    </section>

    <section class="card">
      <h3>❤️ Мои причины</h3>
      <p class="muted">Зачем ты отказываешься. Они покажутся, когда станет трудно.</p>
      <ul class="reasons">${S.reasons.map((r, i) => `<li><span>${esc(r)}</span><button class="x" data-act="rm-reason" data-i="${i}" aria-label="Удалить">×</button></li>`).join('')}</ul>
      <form class="inline" data-form="reason">
        <input name="r" maxlength="140" placeholder="Например: хочу видеть, как растут дети" autocomplete="off">
        <button class="btn primary small" aria-label="Добавить">＋</button>
      </form>
    </section>

    <section class="card">
      <h3>✉️ Письмо себе</h3>
      <p class="muted">${S.letter ? 'Оно откроется в трудный момент. Можно перечитать и сейчас.' : 'Напиши себе пару слов на трудный момент — они сработают лучше любых фраз.'}</p>
      <div class="row"><button class="btn ghost small" data-act="letter">${S.letter ? 'Открыть письмо' : 'Написать письмо'}</button>${S.letter ? '<button class="btn ghost small" data-act="letter-edit">Переписать</button>' : ''}</div>
    </section>

    <section class="card">
      <h3>📞 Кому позвонить</h3>
      <p class="muted">Человек, который поддержит. Кнопка появится в окне тяги.</p>
      <form class="contact" data-form="contact">
        <input name="name" maxlength="30" placeholder="Имя" value="${esc(S.contact?.name || '')}">
        <input name="phone" type="tel" maxlength="20" placeholder="+7…" value="${esc(S.contact?.phone || '')}">
        <button class="btn primary small">Сохранить</button>
      </form>
    </section>

    ${accountCard()}

    <section class="card">
      <h3>🔔 Фразы в уведомлениях</h3>
      <label class="switch"><input type="checkbox" data-act="notify" ${S.notify && perm === 'granted' ? 'checked' : ''}><span></span>Фраза каждый час</label>
      <div class="hours">с <select data-act="from">${hoursOpts(S.notifyFrom)}</select> до <select data-act="to">${hoursOpts(S.notifyTo)}</select></div>
      <p class="muted tiny">${perm === 'unsupported' ? 'Этот браузер не умеет показывать уведомления. На iPhone добавь приложение на экран «Домой» — тогда получится.' :
        perm === 'denied' ? 'Уведомления запрещены в настройках браузера — разреши их для этого сайта.' :
        'Приходят, пока приложение открыто или свёрнуто. Добавь его на главный экран — так оно не будет закрываться.'}</p>
      <button class="btn ghost small" data-act="install">📲 Как добавить на главный экран</button>
    </section>

    <section class="card">
      <h3>💾 Данные</h3>
      <p class="muted tiny">Всё хранится только на этом устройстве. Сохрани копию, чтобы перенести на другой телефон.</p>
      <div class="row">
        <button class="btn ghost small" data-act="export">Сохранить копию</button>
        <label class="btn ghost small">Загрузить копию<input type="file" accept="application/json" data-act="import" hidden></label>
      </div>
      <button class="btn ghost small danger" data-act="reset">Начать всё с нуля</button>
    </section>
  `;
}
function accountCard() {
  const a = account();
  if (a) {
    const nid = a.via === 'nid';
    const where = nid ? (a.family ? 'Nikitenok ID · связан с Family' : 'Nikitenok ID') : 'Профиль NikitenokFamily';
    return `<section class="card account on">
      <div class="acc-head"><span class="acc-ico">${nid ? '🔑' : '👨‍👩‍👧'}</span><div><b>${esc(a.name)}</b><small class="muted">${where} · ${syncStatus.error ? 'нет связи, сохраню позже' : 'прогресс сохраняется'}</small></div></div>
      <p class="muted tiny">Прогресс одинаковый на всех устройствах, где ты вошёл.${!nid || a.family ? ' Серия видна в твоём профиле в Family.' : ''}</p>
      ${nid ? '' : `<p class="muted tiny">Новое: один вход для всех приложений Nikitenok. Перейди на Nikitenok ID — прогресс и серия в Family останутся.</p>
      <button class="btn primary wide small" data-act="nid-login">🔑 Перейти на Nikitenok ID</button>`}
      <div class="row">${nid ? `<a class="btn ghost small" href="https://id.nikitenok.ru/account" target="_blank" rel="noopener">Аккаунт</a>` : ''}<button class="btn ghost small" data-act="sync">Синхронизировать</button><button class="btn ghost small" data-act="logout">Выйти</button></div>
    </section>`;
  }
  return `<section class="card account">
    <div class="acc-head"><span class="acc-ico">🔑</span><div><b>Войти через Nikitenok ID</b><small class="muted">Telegram или Яндекс. Прогресс не потеряется и будет на всех устройствах</small></div></div>
    <button class="btn primary wide" data-act="nid-login">Войти через Nikitenok ID</button>
    <a class="btn ghost wide small" href="${FAMILY_LOGIN}">👨‍👩‍👧 Войти через Family</a>
  </section>`;
}
const hoursOpts = (sel) => Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${pad(i)}:00</option>`).join('');

// ---------- Тикер ----------
let lastBadgeCheck = 0;
function tick() {
  const r = route();
  for (const el of $$('[data-timer]')) {
    const h = findHabit(el.dataset.timer);
    if (!h) continue;
    const ms = elapsed(h);
    el.innerHTML = timerHtml(ms);
    const nm = nextMilestone(ms);
    const bar = $(`[data-bar="${h.id}"]`);
    if (bar) bar.style.width = (nm.pct * 100).toFixed(2) + '%';
    const left = $(`[data-left="${h.id}"]`);
    if (left && nm.next) left.textContent = shortDur(nm.next.at - ms);
    const saved = $(`[data-saved="${h.id}"]`);
    if (saved) saved.textContent = (r.name === 'home' ? '+' : '') + money(savedOf(h));
    const av = $(`[data-avoided="${h.id}"]`);
    if (av) av.textContent = num((h.perDay * ms) / DAY);
  }
  for (const el of $$('[data-countdown]')) {
    const h = findHabit(el.dataset.countdown);
    if (!h) continue;
    if (!isPlanned(h)) { render(); celebrateStart(h); return; }
    el.textContent = shortDur(h.start - Date.now());
  }
  $$('[data-saved-total]').forEach((el) => (el.textContent = money(savedTotal())));
  const hp = phraseOfHour();
  $$('[data-hour-phrase]').forEach((el) => { if (el.textContent !== hp) el.textContent = hp; });
  // Новые этапы — поздравляем один раз.
  for (const h of S.habits) {
    if (isPlanned(h)) continue;
    const nm = nextMilestone(elapsed(h));
    const reached = nm.prev?.title || null;
    if (h.lastMilestone === undefined) { h.lastMilestone = reached; save(); }
    else if (reached && h.lastMilestone !== reached) {
      h.lastMilestone = reached;
      save();
      celebrateMilestone(h, nm.prev);
    }
  }
  if (Date.now() - lastBadgeCheck > 30e3) { lastBadgeCheck = Date.now(); showBadges(checkBadges()); }
}
setInterval(tick, 1000);

function celebrateMilestone(h, m) {
  confetti();
  vibrate([60, 40, 60]);
  const s = sheet(`<div class="celebrate"><div class="big-emoji pop-in">${esc(h.emoji)}</div>
    <h2>${m.title} без «${esc(h.name)}»!</h2><p>${m.text}</p>
    <button class="btn primary wide" data-share>↗ Поделиться</button>
    <button class="btn ghost wide" data-ok>Спасибо!</button></div>`);
  s.el.addEventListener('click', (e) => {
    if (e.target.closest('[data-share]')) shareProgress(h);
    if (e.target.closest('[data-ok]')) s.close();
  });
}
function celebrateStart(h) {
  confetti();
  toast(`${h.emoji} Старт! Отсчёт пошёл. У тебя всё получится 🌱`);
}
function showBadges(list) {
  if (!list.length) return;
  confetti();
  const b = list[0];
  toast(`${b.emoji} Новая награда: «${b.title}»${list.length > 1 ? ` и ещё ${list.length - 1}` : ''}`);
}

// ---------- Уведомления ----------
async function swReg() {
  try { return await navigator.serviceWorker?.getRegistration(); } catch { return null; }
}
async function notifyNow(title, body) {
  const reg = await swReg();
  const opts = { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'phrase', renotify: true };
  try { if (reg) await reg.showNotification(title, opts); else new Notification(title, opts); } catch {}
}
async function checkNotify() {
  if (!S.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  const d = new Date();
  const h = d.getHours();
  const inRange = S.notifyFrom <= S.notifyTo ? h >= S.notifyFrom && h < S.notifyTo : h >= S.notifyFrom || h < S.notifyTo;
  const key = `${dayKey(d)}-${h}`;
  if (!inRange || S.lastNotified === key) return;
  const firstToday = !S.lastNotified.startsWith(dayKey(d));
  S.lastNotified = key;
  save();
  let title = firstToday ? 'Фраза дня' : 'Фраза часа';
  let body = firstToday ? phraseOfDay(d) : phraseOfHour(d);
  const ci = S.checkins[dayKey(d)];
  if (h >= 20 && ci?.pledge && !ci.eveningSent) { title = 'Ещё один день свободы'; body = 'Ты сдержал обещание сегодня. Гордись собой! 🌙'; ci.eveningSent = true; save(); }
  if (document.visibilityState === 'visible') { toast(`${title}: ${body}`); return; }
  notifyNow(title, body);
}
setInterval(checkNotify, 30e3);

// ---------- Знакомство ----------
function onboarding() {
  const draft = { preset: null, name: '', emoji: '✨', unit: '', perDay: 0, costPerDay: 0, when: 'now', start: Date.now(), reasons: [], triggers: [] };
  let step = 0;
  const wrap = document.createElement('div');
  wrap.className = 'onboard';
  document.body.appendChild(wrap);
  const steps = [welcome, pickHabit, pickWhen, pickWhy, pickTriggers, plan];
  const go = (n) => { step = n; draw(); };
  function draw() {
    wrap.innerHTML = `<div class="ob-top">${step > 0 ? '<button class="ob-back" data-back aria-label="Назад">←</button>' : '<span></span>'}
      <div class="steps" ${step === 0 ? 'hidden' : ''}>${steps.slice(1).map((_, i) => `<i class="${i + 1 < step ? 'done' : i + 1 === step ? 'on' : ''}"></i>`).join('')}</div><span></span></div>
      <div class="ob-body fade-in">${steps[step]()}</div>`;
    const back = $('[data-back]', wrap);
    if (back) back.onclick = () => go(step - 1);
    wire[step]?.();
    wrap.scrollTop = 0;
  }
  function welcome() {
    return `<div class="ob-hero"><img src="icon.svg" alt="" width="96" height="96" class="pop-in"><h1>Свобода</h1>
      <p class="lead">Помогу отказаться от вредной привычки и не сорваться.</p></div>
      <ul class="ob-points">
        <li><span>⏱️</span><div><b>Таймер свободы</b><small>Видно каждую минуту без привычки и сэкономленные деньги</small></div></li>
        <li><span>🆘</span><div><b>Помощь при тяге</b><small>Игры, дыхание и дела, чтобы переждать 5 минут</small></div></li>
        <li><span>✨</span><div><b>Мотивация каждый день</b><small>Фразы, награды и твои собственные причины</small></div></li>
      </ul>
      <button class="btn primary wide big-btn" data-next>Начать</button>
      <button class="btn ghost wide" data-nid-login>🔑 Войти через Nikitenok ID</button>
      <a class="btn ghost wide small" href="${FAMILY_LOGIN}">👨‍👩‍👧 Войти через NikitenokFamily</a>
      <label class="btn ghost wide small">У меня есть копия данных<input type="file" accept="application/json" data-import hidden></label>`;
  }
  function pickHabit() {
    return `<h2>От чего отказываемся?</h2>
      <div class="ob-grid">${PRESETS.filter((p) => p.key !== 'other').map((p) => `<button class="ob-tile ${draft.preset === p.key ? 'on' : ''}" data-preset="${p.key}"><span>${p.emoji}</span>${p.name}</button>`).join('')}</div>
      <label class="field-label">Или своя привычка<input data-custom maxlength="40" placeholder="Например: грызть ногти" value="${draft.preset === 'other' ? esc(draft.name) : ''}"></label>
      <button class="btn primary wide big-btn" data-next ${draft.name ? '' : 'disabled'}>Дальше</button>`;
  }
  function pickWhen() {
    return `<h2>Когда ${draft.preset === 'other' ? 'отказываешься' : 'бросаешь'}?</h2>
      <div class="ob-options">
        <button class="ob-opt ${draft.when === 'now' ? 'on' : ''}" data-when="now"><b>🚀 Прямо сейчас</b><small>Таймер начнётся с этой минуты</small></button>
        <button class="ob-opt ${draft.when === 'past' ? 'on' : ''}" data-when="past"><b>✅ Уже бросил</b><small>Укажу, когда это было</small></button>
        <button class="ob-opt ${draft.when === 'future' ? 'on' : ''}" data-when="future"><b>📅 Назначу день</b><small>Подготовлюсь и начну в выбранный день</small></button>
      </div>
      ${draft.when !== 'now' ? `<label class="field-label">${draft.when === 'past' ? 'Когда бросил' : 'День старта'}<input type="datetime-local" data-start value="${localInput(draft.start)}"></label>` : ''}
      <div class="two">
        <label class="field-label">Сколько в день<input type="number" inputmode="decimal" min="0" data-f="perDay" value="${draft.perDay || ''}" placeholder="0"></label>
        <label class="field-label">Чего<input data-f="unit" maxlength="20" value="${esc(draft.unit)}" placeholder="раз"></label>
      </div>
      <label class="field-label">Сколько тратил в день, ₽<input type="number" inputmode="decimal" min="0" data-f="costPerDay" value="${draft.costPerDay || ''}" placeholder="0"></label>
      <p class="muted tiny">Можно оставить пустым. Тогда не будет счётчика денег.</p>
      <button class="btn primary wide big-btn" data-next>Дальше</button>`;
  }
  function pickWhy() {
    const custom = draft.reasons.filter((r) => !REASON_IDEAS.includes(r));
    return `<h2>Зачем тебе это?</h2>
      <p class="muted">Выбери или напиши своё. Эти причины будут напоминать о главном в трудную минуту.</p>
      <div class="chips">${[...REASON_IDEAS, ...custom].map((r) => `<button class="chip ${draft.reasons.includes(r) ? 'on' : ''}" data-reason="${esc(r)}">${esc(r)}</button>`).join('')}</div>
      <form class="inline" data-own><input name="r" maxlength="140" placeholder="Своя причина" autocomplete="off"><button class="btn primary small">＋</button></form>
      <button class="btn primary wide big-btn" data-next>${draft.reasons.length ? 'Дальше' : 'Пропустить'}</button>`;
  }
  function pickTriggers() {
    return `<h2>Когда обычно тянет?</h2>
      <p class="muted">Знать свои триггеры — половина успеха. Подберу советы и занятия под них.</p>
      <div class="ob-grid small">${TRIGGERS.filter((t) => t.key !== 'other').map((t) => `<button class="ob-tile ${draft.triggers.includes(t.key) ? 'on' : ''}" data-trig="${t.key}"><span>${t.emoji}</span>${t.name}</button>`).join('')}</div>
      <button class="btn primary wide big-btn" data-next>${draft.triggers.length ? 'Дальше' : 'Пропустить'}</button>`;
  }
  function plan() {
    const future = draft.when === 'future' && draft.start > Date.now();
    return `<div class="ob-hero"><div class="big-emoji pop-in">${esc(draft.emoji)}</div><h2>Твой план готов</h2>
      <p class="muted">${future ? `Старт ${fmtDate(draft.start, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}. До этого дня — подготовка.` : draft.when === 'past' ? `Ты уже свободен ${shortDur(Date.now() - draft.start)}. Продолжаем!` : 'Отсчёт начнётся, как только нажмёшь «Поехали».'}</p></div>
      <ul class="ob-plan">
        <li><span>🆘</span><div><b>Когда потянет</b><small>Жми красную кнопку «Хочется сорваться?». Подберу занятие, и через 5 минут станет легче.</small></div></li>
        ${draft.triggers.map((t) => `<li><span>${trig(t).emoji}</span><div><b>${trig(t).name}</b><small>${esc(TRIGGER_TIPS[t])}</small></div></li>`).join('')}
        <li><span>📅</span><div><b>Каждый день</b><small>Отмечай настроение и давай себе обещание — только на сегодня.</small></div></li>
      </ul>
      ${'Notification' in window && Notification.permission !== 'denied' ? `<label class="switch card"><input type="checkbox" data-notif ${S.notify ? 'checked' : ''}><span></span>Присылать мотивирующую фразу каждый час</label>` : ''}
      <button class="btn primary wide big-btn" data-finish>Поехали! 🚀</button>`;
  }
  const wire = [
    () => {
      $('[data-next]', wrap).onclick = () => go(1);
      $('[data-nid-login]', wrap).onclick = () => loginWithNid();
      $('[data-import]', wrap).onchange = async (e) => {
        if (await importFile(e.target.files?.[0])) { wrap.remove(); render(); }
      };
    },
    () => {
      const next = $('[data-next]', wrap);
      wrap.addEventListener('click', onPreset);
      function onPreset(e) {
        const b = e.target.closest('[data-preset]');
        if (!b || step !== 1) return;
        const p = PRESETS.find((x) => x.key === b.dataset.preset);
        Object.assign(draft, { preset: p.key, name: p.name, emoji: p.emoji, unit: p.unit, perDay: p.perDay, costPerDay: p.costPerDay });
        wrap.removeEventListener('click', onPreset);
        go(2);
      }
      $('[data-custom]', wrap).oninput = (e) => {
        const v = e.target.value.trim();
        Object.assign(draft, { preset: 'other', name: v, emoji: '✨', unit: 'раз', perDay: 0, costPerDay: 0 });
        next.disabled = !v;
        $$('.ob-tile', wrap).forEach((t) => t.classList.remove('on'));
      };
      next.onclick = () => { wrap.removeEventListener('click', onPreset); if (draft.name) go(2); };
    },
    () => {
      $$('[data-when]', wrap).forEach((b) => (b.onclick = () => {
        draft.when = b.dataset.when;
        const now = Date.now();
        if (draft.when === 'now') draft.start = now;
        if (draft.when === 'past' && draft.start > now - 60e3) draft.start = now - DAY;
        if (draft.when === 'future' && draft.start <= now) { const d = new Date(now + DAY); d.setHours(8, 0, 0, 0); draft.start = d.getTime(); }
        readFields();
        draw();
      }));
      const st = $('[data-start]', wrap);
      if (st) st.onchange = () => { if (st.value) draft.start = new Date(st.value).getTime(); };
      $('[data-next]', wrap).onclick = () => {
        readFields();
        if (st?.value) draft.start = new Date(st.value).getTime();
        if (draft.when === 'now') draft.start = Date.now();
        if (draft.when === 'past' && draft.start > Date.now()) return toast('Эта дата ещё не наступила — выбери «Назначу день»');
        if (draft.when === 'future' && draft.start <= Date.now()) return toast('Выбери день в будущем');
        go(3);
      };
      function readFields() {
        for (const el of $$('[data-f]', wrap)) draft[el.dataset.f] = el.type === 'number' ? +el.value || 0 : el.value.trim();
      }
    },
    () => {
      $$('[data-reason]', wrap).forEach((b) => (b.onclick = () => {
        const r = b.dataset.reason;
        draft.reasons = draft.reasons.includes(r) ? draft.reasons.filter((x) => x !== r) : [...draft.reasons, r];
        b.classList.toggle('on');
        $('[data-next]', wrap).textContent = draft.reasons.length ? 'Дальше' : 'Пропустить';
      }));
      $('[data-own]', wrap).onsubmit = (e) => {
        e.preventDefault();
        const v = e.target.r.value.trim();
        if (v && !draft.reasons.includes(v)) { draft.reasons.push(v); draw(); }
      };
      $('[data-next]', wrap).onclick = () => go(4);
    },
    () => {
      $$('[data-trig]', wrap).forEach((b) => (b.onclick = () => {
        const k = b.dataset.trig;
        draft.triggers = draft.triggers.includes(k) ? draft.triggers.filter((x) => x !== k) : [...draft.triggers, k];
        b.classList.toggle('on');
        $('[data-next]', wrap).textContent = draft.triggers.length ? 'Дальше' : 'Пропустить';
      }));
      $('[data-next]', wrap).onclick = () => go(5);
    },
    () => {
      const n = $('[data-notif]', wrap);
      if (n) n.onchange = async () => { n.checked = await setNotify(n.checked, true); };
      $('[data-finish]', wrap).onclick = () => {
        const start = draft.when === 'now' ? Date.now() : draft.start;
        const h = { id: uid(), created: Date.now(), best: 0, relapses: [], slips: [], cravings: 0, preset: draft.preset, name: draft.name, emoji: draft.emoji, unit: draft.unit, perDay: draft.perDay, costPerDay: draft.costPerDay, start, triggers: draft.triggers };
        S.habits.push(h);
        for (const r of draft.reasons) if (!S.reasons.includes(r)) S.reasons.push(r);
        S.onboarded = true;
        save();
        wrap.classList.add('out');
        setTimeout(() => wrap.remove(), 250);
        location.hash = '#/';
        render(true);
        confetti();
        toast(start > Date.now() ? 'План сохранён. Готовься — ты справишься 💚' : 'Отсчёт пошёл. Ты молодец, что начал! 🌱');
        showBadges(checkBadges());
      };
    },
  ];
  draw();
}

// ---------- Тяга (кнопка SOS) ----------
function sosFlow(habitId) {
  const ctx = { habitId: habitId || (S.habits.filter((h) => !isPlanned(h)).length === 1 ? S.habits.find((h) => !isPlanned(h)).id : null), before: 6, trigger: null };
  const active = S.habits.filter((h) => !isPlanned(h));
  const s = sheet(`
    <h2>Держись. Сейчас станет легче</h2>
    <p class="muted">Ответь на два вопроса — подберу, что поможет именно сейчас.</p>
    ${active.length > 1 ? `<div class="field-label">Что тянет?</div><div class="chips">${active.map((h) => `<button class="chip ${ctx.habitId === h.id ? 'on' : ''}" data-h="${h.id}">${esc(h.emoji)} ${esc(h.name)}</button>`).join('')}</div>` : ''}
    <div class="field-label">Насколько сильно тянет? <b class="lvl-v">6</b> из 10</div>
    <input type="range" min="1" max="10" value="6" class="lvl" aria-label="Сила тяги">
    <div class="lvl-scale"><span>чуть-чуть</span><span>очень сильно</span></div>
    <div class="field-label">Что случилось перед этим?</div>
    <div class="chips">${TRIGGERS.map((t) => `<button class="chip" data-t="${t.key}">${t.emoji} ${t.name}</button>`).join('')}</div>
    <button class="btn primary wide big-btn" data-go>Дальше</button>
    <button class="btn ghost wide small" data-quick>Сразу к занятиям</button>`, { cls: 'tall' });
  const lvl = $('.lvl', s.el);
  lvl.oninput = () => { ctx.before = +lvl.value; $('.lvl-v', s.el).textContent = lvl.value; lvl.style.setProperty('--p', ((lvl.value - 1) / 9) * 100 + '%'); };
  lvl.oninput();
  s.el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]');
    if (t) { ctx.trigger = ctx.trigger === t.dataset.t ? null : t.dataset.t; $$('[data-t]', s.el).forEach((b) => b.classList.toggle('on', b.dataset.t === ctx.trigger)); }
    const hb = e.target.closest('[data-h]');
    if (hb) { ctx.habitId = hb.dataset.h; $$('[data-h]', s.el).forEach((b) => b.classList.toggle('on', b === hb)); }
    if (e.target.closest('[data-go]')) { s.close(); sosSuggest(ctx); }
    if (e.target.closest('[data-quick]')) { ctx.before = null; s.close(); sosSuggest(ctx); }
  });
}

function sosSuggest(ctx) {
  const sug = suggestActivities(ctx.trigger, 3);
  const reason = S.reasons.length ? S.reasons[Math.floor(Math.random() * S.reasons.length)] : null;
  const strong = ctx.before >= 8;
  const s = sheet(`
    <h2>${strong ? 'Сильная волна. Но она пройдёт' : 'Ты справишься'}</h2>
    ${ctx.trigger ? `<p class="tip-card">💡 ${esc(TRIGGER_TIPS[ctx.trigger])}</p>` : `<p class="muted">${esc(randomPhrase())}</p>`}
    ${reason ? `<div class="reason-pop">❤️ Помни: ${esc(reason)}</div>` : ''}
    <div class="field-label">Лучше всего сейчас</div>
    <div class="sug">${sug.map((a, i) => `<button class="sug-item ${i === 0 ? 'first' : ''}" data-key="${a.key}"><span class="tile-emoji">${a.emoji}</span><div><b>${a.title}</b><small>${a.text}</small></div><span class="chev">›</span></button>`).join('')}</div>
    <details class="all-acts"><summary>Все занятия</summary>
      <div class="grid small">${ACTIVITIES.filter((a) => !sug.includes(a)).map((a) => `<button class="tile card" data-key="${a.key}"><span class="tile-emoji">${a.emoji}</span><b>${a.title}</b></button>`).join('')}</div>
    </details>
    ${S.contact ? `<a class="btn ghost wide" href="tel:${esc(S.contact.phone)}">📞 Позвонить: ${esc(S.contact.name)}</a>` : ''}
    ${S.letter ? `<button class="btn ghost wide" data-key="letter">✉️ Прочитать письмо себе</button>` : ''}`, { cls: 'tall' });
  s.el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-key]');
    if (!t) return;
    s.close();
    startActivity(t.dataset.key, ctx);
  });
}

function startActivity(key, ctx) {
  S.played = S.played || {};
  S.played[key] = (S.played[key] || 0) + 1;
  save();
  openActivity(key, { onFinish: (f) => afterActivity(f, ctx) });
}

/** Итог занятия: насколько тянет теперь, справился ли. */
function afterActivity({ body, close, title, text, key }, ctx) {
  const fromSos = ctx && ctx.before != null;
  let after = fromSos ? Math.max(1, ctx.before - 3) : 3;
  body.innerHTML = `<div class="finish">
    <div class="big-emoji pop-in">🌿</div>
    <h2>${esc(title)}</h2>
    <p>${esc(text)}</p>
    ${fromSos ? `<div class="field-label">А сейчас насколько тянет? <b class="lvl-v">${after}</b> из 10</div>
      <input type="range" min="1" max="10" value="${after}" class="lvl" aria-label="Сила тяги сейчас">
      <div class="lvl-scale"><span>прошло</span><span>всё ещё сильно</span></div>` : `<p class="muted">${ctx ? 'Тяга прошла?' : 'Хотелось сорваться?'}</p>`}
    <button class="btn primary wide big-btn" data-win>${ctx ? 'Тяга прошла — я справился 💪' : 'Да, и я справился 💪'}</button>
    ${ctx ? '' : '<button class="btn ghost wide" data-free>Нет, просто отвлёкся</button>'}
    <button class="btn ghost wide" data-more>Ещё отвлечься</button>
    ${ctx ? '<button class="btn ghost wide small muted-btn" data-fail>Не удержался</button>' : ''}
  </div>`;
  const lvl = $('.lvl', body);
  if (lvl) {
    lvl.oninput = () => { after = +lvl.value; $('.lvl-v', body).textContent = lvl.value; lvl.style.setProperty('--p', ((lvl.value - 1) / 9) * 100 + '%'); };
    lvl.oninput();
  }
  const habitId = ctx?.habitId || (S.habits.length === 1 ? S.habits[0].id : null);
  $('[data-win]', body).onclick = () => {
    S.wins++;
    const h = habitId && findHabit(habitId);
    if (h) h.cravings = (h.cravings || 0) + 1;
    logCraving({ habitId, trigger: ctx?.trigger || null, before: fromSos ? ctx.before : null, after: fromSos ? after : null, activity: key, ok: true });
    close(true);
    confetti();
    vibrate([60, 40, 60]);
    const drop = fromSos && ctx.before > after ? ` Тяга упала с ${ctx.before} до ${after}.` : '';
    toast(`Победа над тягой №${S.wins}!${drop} 💪`);
    showBadges(checkBadges());
    render();
  };
  const free = $('[data-free]', body);
  if (free) free.onclick = () => { close(true); render(); };
  $('[data-more]', body).onclick = () => {
    close(true);
    if (ctx) { if (fromSos) ctx.before = after; sosSuggest(ctx); } else location.hash = '#/distract';
  };
  const fail = $('[data-fail]', body);
  if (fail) fail.onclick = () => {
    close(true);
    logCraving({ habitId, trigger: ctx?.trigger || null, before: ctx?.before ?? null, after: null, activity: key, ok: false });
    const h = habitId && findHabit(habitId);
    if (h) relapse(h, ctx?.trigger, true); else toast('Ничего страшного. Начни заново — ты уже знаешь, как держаться.');
  };
}

// ---------- Срыв ----------
function relapse(h, trigger = null, logged = false) {
  const ctx = { trigger, note: '' };
  const s = sheet(`
    <h2>Бывает. Это не конец</h2>
    <p class="muted">Почти все, кто в итоге бросил, срывались по пути. Важно не сколько раз ты упал, а что ты снова встал.</p>
    <div class="ob-options">
      <button class="ob-opt" data-kind="slip"><b>🟡 Оступился один раз</b><small>Это была ошибка, а не возврат. Таймер продолжится, в истории останется отметка.</small></button>
      <button class="ob-opt" data-kind="relapse"><b>🔴 Начать заново</b><small>Таймер пойдёт с нуля. Лучшая серия (${shortDur(Math.max(h.best || 0, elapsed(h)))}) и сэкономленные деньги сохранятся.</small></button>
    </div>
    <div class="field-label">Что спровоцировало?</div>
    <div class="chips">${TRIGGERS.map((t) => `<button class="chip ${trigger === t.key ? 'on' : ''}" data-t="${t.key}">${t.emoji} ${t.name}</button>`).join('')}</div>
    <input data-note maxlength="120" placeholder="Заметка для себя (необязательно)">
    <button class="btn ghost wide" data-no>Я передумал — держусь</button>`, { cls: 'tall' });
  s.el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]');
    if (t) { ctx.trigger = ctx.trigger === t.dataset.t ? null : t.dataset.t; $$('[data-t]', s.el).forEach((b) => b.classList.toggle('on', b.dataset.t === ctx.trigger)); }
    if (e.target.closest('[data-no]')) { s.close(); sosFlow(h.id); }
    const k = e.target.closest('[data-kind]');
    if (!k) return;
    ctx.note = $('[data-note]', s.el).value.trim();
    const entry = { t: Date.now(), trigger: ctx.trigger, note: ctx.note };
    if (!logged) logCraving({ habitId: h.id, trigger: ctx.trigger, ok: false });
    if (k.dataset.kind === 'slip') {
      h.slips = [...(h.slips || []), entry];
      save();
      s.close();
      render();
      supportAfter(h, ctx.trigger, 'Отметка сохранена. Таймер идёт дальше — одна ошибка не перечёркивает путь.');
    } else {
      const ms = elapsed(h);
      h.best = Math.max(h.best || 0, ms);
      h.pastMs = (h.pastMs || 0) + ms;
      h.relapses = [...(h.relapses || []), entry];
      h.start = Date.now();
      delete h.lastMilestone;
      save();
      s.close();
      render();
      supportAfter(h, ctx.trigger, 'Новый старт. Первый час — уже скоро. Ты знаешь больше, чем в прошлый раз.');
    }
  });
}
function supportAfter(h, trigger, text) {
  const s = sheet(`<div class="celebrate"><div class="big-emoji">💚</div><h2>Ты молодец, что честен с собой</h2><p>${esc(text)}</p>
    ${trigger ? `<p class="tip-card">💡 В следующий раз, когда будет «${esc(trig(trigger).name.toLowerCase())}»: ${esc(TRIGGER_TIPS[trigger])}</p>` : ''}
    <button class="btn primary wide" data-ok>Продолжаю</button></div>`);
  $('[data-ok]', s.el).onclick = () => s.close();
}

// ---------- Привычка: добавить / изменить ----------
function habitForm(h) {
  const isNew = !h;
  const preset = h ? PRESETS.find((p) => p.key === h.preset) || PRESETS.at(-1) : PRESETS[0];
  const v = h || { ...preset, preset: preset.key, start: Date.now(), triggers: [] };
  const s = sheet(`
    <h2>${isNew ? 'Новая привычка' : 'Изменить привычку'}</h2>
    ${isNew ? `<div class="chips">${PRESETS.map((p, i) => `<button type="button" class="chip ${i === 0 ? 'on' : ''}" data-preset="${p.key}">${p.emoji} ${p.name}</button>`).join('')}</div>` : ''}
    <form data-form="habit">
      <label class="field-label">Название<input name="name" required maxlength="40" value="${esc(v.name)}"></label>
      <div class="emojis">${EMOJIS.map((e) => `<button type="button" class="emo ${e === v.emoji ? 'on' : ''}" data-emoji="${e}">${e}</button>`).join('')}</div>
      <input type="hidden" name="emoji" value="${esc(v.emoji)}">
      <input type="hidden" name="preset" value="${esc(v.preset || preset.key)}">
      <label class="field-label">${isNew ? 'Когда отказался (можно выбрать день в будущем)' : 'Начало отсчёта'}<input type="datetime-local" name="start" value="${localInput(v.start)}"></label>
      <div class="two">
        <label class="field-label">Сколько в день<input type="number" inputmode="decimal" name="perDay" min="0" step="any" value="${v.perDay || ''}" placeholder="0"></label>
        <label class="field-label">Чего<input name="unit" maxlength="20" value="${esc(v.unit || '')}" placeholder="сигарет"></label>
      </div>
      <label class="field-label">Тратил в день, ₽<input type="number" inputmode="decimal" name="costPerDay" min="0" step="any" value="${v.costPerDay || ''}" placeholder="0"></label>
      <div class="field-label">Когда обычно тянет</div>
      <div class="chips">${TRIGGERS.filter((t) => t.key !== 'other').map((t) => `<button type="button" class="chip ${(v.triggers || []).includes(t.key) ? 'on' : ''}" data-trig="${t.key}">${t.emoji} ${t.name}</button>`).join('')}</div>
      <button class="btn primary wide big-btn">${isNew ? 'Начать отсчёт' : 'Сохранить'}</button>
    </form>`, { cls: 'tall' });
  const f = $('form', s.el);
  const triggers = new Set(v.triggers || []);
  s.el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-preset]');
    if (p) {
      const pr = PRESETS.find((x) => x.key === p.dataset.preset);
      $$('[data-preset]', s.el).forEach((c) => c.classList.toggle('on', c === p));
      f.name.value = pr.key === 'other' ? '' : pr.name;
      f.perDay.value = pr.perDay || '';
      f.unit.value = pr.key === 'other' ? '' : pr.unit;
      f.costPerDay.value = pr.costPerDay || '';
      f.preset.value = pr.key;
      setEmoji(pr.emoji);
      if (pr.key === 'other') f.name.focus();
    }
    const em = e.target.closest('[data-emoji]');
    if (em) setEmoji(em.dataset.emoji);
    const tg = e.target.closest('[data-trig]');
    if (tg) { triggers.has(tg.dataset.trig) ? triggers.delete(tg.dataset.trig) : triggers.add(tg.dataset.trig); tg.classList.toggle('on'); }
  });
  function setEmoji(x) {
    f.emoji.value = x;
    $$('.emo', s.el).forEach((b) => b.classList.toggle('on', b.dataset.emoji === x));
  }
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const start = f.start.value ? new Date(f.start.value).getTime() : Date.now();
    const data = {
      name: f.name.value.trim() || 'Привычка',
      emoji: f.emoji.value,
      preset: f.preset.value,
      start,
      perDay: +f.perDay.value || 0,
      unit: f.unit.value.trim(),
      costPerDay: +f.costPerDay.value || 0,
      triggers: [...triggers],
    };
    if (isNew) {
      const nh = { id: uid(), created: Date.now(), best: 0, relapses: [], slips: [], cravings: 0, ...data };
      S.habits.push(nh);
      save();
      s.close();
      location.hash = '#/h/' + nh.id;
      toast(start > Date.now() ? 'План сохранён. Готовься — ты справишься 💚' : 'Отсчёт пошёл. Ты молодец, что начал! 🌱');
      showBadges(checkBadges());
    } else {
      Object.assign(h, data);
      delete h.lastMilestone;
      save();
      s.close();
      render();
    }
  });
}

// ---------- Цель копилки ----------
function goalForm() {
  const s = sheet(`<h2>На что копишь?</h2>
    <p class="muted">Деньги, которые раньше уходили на привычку, теперь копятся на цель. Так легче держаться.</p>
    <form data-form="goal">
      <label class="field-label">Цель<input name="title" maxlength="40" required placeholder="Например: новые кроссовки" value="${esc(S.goal?.title || '')}"></label>
      <label class="field-label">Сколько стоит, ₽<input name="price" type="number" inputmode="numeric" min="1" required value="${S.goal?.price || ''}"></label>
      <button class="btn primary wide big-btn">Сохранить цель</button>
      ${S.goal ? '<button type="button" class="btn ghost wide danger" data-rm>Убрать цель</button>' : ''}
    </form>`);
  const f = $('form', s.el);
  f.onsubmit = (e) => {
    e.preventDefault();
    S.goal = { title: f.title.value.trim(), price: +f.price.value };
    save(); s.close(); render();
  };
  const rm = $('[data-rm]', s.el);
  if (rm) rm.onclick = () => { S.goal = null; save(); s.close(); render(); };
}

// ---------- Разное ----------
async function setNotify(on, quiet = false) {
  if (!on) { S.notify = false; save(); return false; }
  if (!('Notification' in window)) { toast('Этот браузер не умеет показывать уведомления'); return false; }
  const p = await Notification.requestPermission();
  if (p !== 'granted') { S.notify = false; save(); if (!quiet) render(); return false; }
  S.notify = true;
  S.lastNotified = `${dayKey()}-${new Date().getHours()}`;
  save();
  notifyNow('Фраза дня', phraseOfDay());
  toast('Готово! Фразы будут приходить каждый час');
  return true;
}
async function importFile(file) {
  if (!file) return false;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.habits)) throw new Error();
    if (S.habits.length && !(await ask('Заменить данные?', 'Текущие привычки и прогресс заменятся загруженной копией.', 'Заменить'))) return false;
    replaceState({ ...data, onboarded: true });
    toast('Копия загружена');
    return true;
  } catch { toast('Не получилось прочитать файл'); return false; }
}
function installHelp() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (deferredInstall) {
    deferredInstall.prompt();
    deferredInstall = null;
    return;
  }
  sheet(`<h2>На главный экран</h2>
    ${ios ? `<ol class="steps-list"><li>Открой сайт в Safari</li><li>Нажми «Поделиться» <b>⬆︎</b> внизу экрана</li><li>Выбери «На экран „Домой“»</li></ol>` :
      `<ol class="steps-list"><li>Открой меню браузера <b>⋮</b></li><li>Выбери «Добавить на главный экран» или «Установить приложение»</li></ol>`}
    <p class="muted">Приложение будет открываться как обычное, без адресной строки, и работать без интернета.</p>`);
}
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });

// ---------- События ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const a = t.dataset.act;
  const h = t.dataset.id && findHabit(t.dataset.id);
  if (a === 'add') habitForm();
  else if (a === 'edit' && h) habitForm(h);
  else if (a === 'delete' && h) {
    if (await ask(`Удалить «${h.name}»?`, 'Весь прогресс по этой привычке пропадёт.', 'Удалить', 'Отмена', true)) {
      S.habits = S.habits.filter((x) => x !== h);
      save();
      location.hash = '#/';
      render();
    }
  } else if (a === 'relapse' && h) relapse(h);
  else if (a === 'sos') sosFlow(h?.id);
  else if (a === 'activity') startActivity(t.dataset.key, null);
  else if (a === 'random') {
    const pool = ACTIVITIES.filter((x) => !['reasons', 'letter'].includes(x.key));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    toast(`${pick.emoji} ${pick.title}`);
    startActivity(pick.key, null);
  } else if (a === 'start-now' && h) { h.start = Date.now(); delete h.lastMilestone; save(); render(); celebrateStart(h); }
  else if (a === 'share' && h) shareProgress(h);
  else if (a === 'share-phrase') {
    const text = t.dataset.day ? phraseOfDay() : phraseOfHour();
    const url = location.origin + location.pathname;
    if (navigator.share) navigator.share({ text: `«${text}»`, url }).catch(() => {});
    else { try { await navigator.clipboard.writeText(`«${text}» — ${url}`); toast('Фраза скопирована'); } catch {} }
  } else if (a === 'mood') {
    S.checkins[dayKey()] = { mood: +t.dataset.v, pledge: false, t: Date.now() };
    save();
    vibrate(15);
    if (+t.dataset.v <= 2) toast('Трудные дни тоже проходят. Если потянет — жми красную кнопку 💚');
    render();
    showBadges(checkBadges());
  } else if (a === 'pledge') {
    const c = S.checkins[dayKey()];
    if (c) c.pledge = true;
    save();
    confetti();
    toast('Обещание дано. Только сегодня — ты справишься 🤝');
    render();
    showBadges(checkBadges());
  } else if (a === 'goal') goalForm();
  else if (a === 'badge') {
    const b = BADGES.find((x) => x.id === t.dataset.id);
    const got = S.badges[b.id];
    sheet(`<div class="celebrate"><div class="big-emoji ${got ? '' : 'locked'}">${b.emoji}</div><h2>${b.title}</h2><p>${b.text}</p>
      <p class="muted">${got ? 'Получена ' + fmtDate(got) : 'Ещё не получена'}</p></div>`);
  } else if (a === 'rnd') $('#rnd').textContent = randomPhrase();
  else if (a === 'rm-reason') { S.reasons.splice(+t.dataset.i, 1); save(); render(); }
  else if (a === 'letter') startActivity('letter', null);
  else if (a === 'letter-edit') { S.letter = ''; save(); startActivity('letter', null); }
  else if (a === 'install') installHelp();
  else if (a === 'nid-login') loginWithNid();
  else if (a === 'sync') { await push(true); await pull(); toast(syncStatus.error ? 'Нет связи с сервером — попробую позже' : 'Прогресс синхронизирован'); render(); }
  else if (a === 'logout') {
    if (await ask('Выйти из профиля?', 'Прогресс останется на этом устройстве и на сервере — войдёшь снова, и он вернётся.', 'Выйти')) { logout(); render(); }
  }
  else if (a === 'export') {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `svoboda-${dayKey()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } else if (a === 'reset') {
    if (await ask('Начать всё с нуля?', account() ? 'Все привычки, причины и прогресс удалятся с этого устройства и с сервера.' : 'Все привычки, причины и прогресс удалятся с этого устройства. Сначала можно сохранить копию.', 'Удалить всё', 'Отмена', true)) {
      resetState();
      location.hash = '#/';
      render();
    }
  }
});
document.addEventListener('change', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const a = t.dataset.act;
  if (a === 'notify') t.checked = await setNotify(t.checked);
  else if (a === 'from') { S.notifyFrom = +t.value; save(); }
  else if (a === 'to') { S.notifyTo = +t.value; save(); }
  else if (a === 'import') { if (await importFile(t.files?.[0])) render(); }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  if (f.dataset.form === 'reason') {
    e.preventDefault();
    const v = f.r.value.trim();
    if (!v) return;
    S.reasons.push(v);
    save();
    render();
  } else if (f.dataset.form === 'contact') {
    e.preventDefault();
    const name = f.name.value.trim(), phone = f.phone.value.trim();
    S.contact = name && phone ? { name, phone } : null;
    save();
    toast(S.contact ? 'Сохранено. Кнопка звонка появится в окне тяги' : 'Контакт удалён');
  }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { render(); checkNotify(); pull().then(() => render()); } });

// ---------- Старт ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
onAccount(() => { $('.onboard')?.remove(); render(); });
(async () => {
  if (hasNidReturn()) {
    $('#main').innerHTML = '<p class="muted center">Входим через Nikitenok ID…</p>';
    await loginFromNid();
  } else if (/[#&]sso=/.test(location.hash)) {
    $('#main').innerHTML = '<p class="muted center">Входим через NikitenokFamily…</p>';
    await loginFromHash();
  }
  render();
  checkNotify();
  if (account()) { await pull(); render(); }
})();
