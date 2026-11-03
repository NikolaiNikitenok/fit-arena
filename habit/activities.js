// Занятия, чтобы переждать тягу: дыхание, игры, движение, дела.
import { $, esc, pad, vibrate, shuffle } from './util.js';
import { S, save } from './store.js';
import { QUICK_TASKS, WORKOUT, WAVE_TIPS, GROUNDING } from './data.js';

let stopCurrent = null;

/**
 * Открывает занятие на весь экран. Когда занятие закончено, вызывается onFinish({ body, close, title, text }),
 * который рисует итог в том же окне. Без onFinish — простой экран «Готово».
 */
export function openActivity(key, { onFinish, onClose } = {}) {
  stopCurrent?.();
  const wrap = document.createElement('div');
  wrap.className = 'activity';
  wrap.innerHTML = `<button class="close" aria-label="Закрыть">×</button><div class="act-body"></div>`;
  document.body.appendChild(wrap);
  const body = $('.act-body', wrap);
  const timers = [];
  const every = (fn, ms) => timers.push(setInterval(fn, ms));
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const cleanup = () => { timers.forEach((t) => { clearInterval(t); clearTimeout(t); }); timers.length = 0; };
  let lock = null;
  const release = () => { try { lock?.release(); } catch {} };
  let closed = false;
  const close = (silent) => {
    if (closed) return;
    closed = true;
    cleanup();
    release();
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 180);
    stopCurrent = null;
    if (!silent) onClose?.();
  };
  stopCurrent = () => close(true);
  $('.close', wrap).onclick = () => close();
  // Пока идёт занятие, экран не гаснет (где поддерживается).
  navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});

  const finish = (title, text) => {
    cleanup();
    release();
    vibrate([40, 30, 40]);
    if (onFinish) return onFinish({ body, close, title, text, key });
    body.innerHTML = `<div class="finish"><div class="big-emoji pop-in">🌿</div><h2>${esc(title)}</h2><p>${esc(text)}</p>
      <button class="btn primary wide" data-ok>Готово</button></div>`;
    $('[data-ok]', body).onclick = () => close();
  };

  const A = {
    wave: () => countdown('Переждать волну', 5 * 60, WAVE_TIPS, '🌊', 'Волна прошла!', 'Ты пережил тягу, не поддавшись ей. Так и тренируется сила воли.'),
    walk: () => countdown('Прогулка', 10 * 60, [
      'Выйди на улицу или хотя бы на балкон.',
      'Иди чуть быстрее обычного — пусть сердце разгонится.',
      'Замечай вокруг: цвета, звуки, запахи.',
      'Дыши носом: вдох на 4 шага, выдох на 4 шага.',
      'Ты молодец. Ещё чуть-чуть.',
    ], '🚶', 'Прогулка засчитана', 'Движение и свежий воздух снимают тягу лучше всего.'),
    breathe: () => breathe('Квадратное дыхание', [['Вдох', 4, 'grow'], ['Задержка', 4, 'hold'], ['Выдох', 4, 'shrink'], ['Пауза', 4, 'rest']], 8),
    breathe478: () => breathe('Дыхание 4-7-8', [['Вдох носом', 4, 'grow'], ['Задержка', 7, 'hold'], ['Выдох ртом', 8, 'shrink']], 4),
    ground, bubbles, memory, reaction, math, workout, task, reasons, letter, arena,
  };
  (A[key] || A.wave)();

  function countdown(title, total, tips, emoji, doneTitle, doneText) {
    let left = total;
    body.innerHTML = `<h2>${title}</h2>
      <div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" class="ring-bg"/><circle cx="60" cy="60" r="54" class="ring-fg" pathLength="100"/></svg>
        <div class="ring-in"><span class="ring-emoji">${emoji}</span><b class="ring-num"></b></div></div>
      <p class="tip"></p>
      <button class="btn ghost small center-btn" data-skip>Мне уже лучше</button>`;
    const n = $('.ring-num', body), fg = $('.ring-fg', body), tipEl = $('.tip', body);
    const draw = () => {
      n.textContent = `${Math.floor(left / 60)}:${pad(left % 60)}`;
      fg.style.strokeDashoffset = String(100 - ((total - left) / total) * 100);
      const tip = tips[Math.min(tips.length - 1, Math.floor(((total - left) / total) * tips.length))];
      if (tipEl.textContent !== tip) { tipEl.textContent = tip; tipEl.classList.remove('fade-in'); void tipEl.offsetWidth; tipEl.classList.add('fade-in'); }
    };
    draw();
    every(() => { left--; draw(); if (left <= 0) finish(doneTitle, doneText); }, 1000);
    $('[data-skip]', body).onclick = () => finish('Отлично!', 'Тяга отступила раньше, чем ты думал.');
  }

  function breathe(title, phases, rounds) {
    let round = 0, ph = 0, sec = 0;
    body.innerHTML = `<h2>${title}</h2>
      <div class="breath"><div class="orb-ring"></div><div class="orb"></div><b class="breath-text"></b></div>
      <p class="muted breath-round"></p>`;
    const orb = $('.orb', body), txt = $('.breath-text', body), rnd = $('.breath-round', body);
    const step = () => {
      const [name, dur, cls] = phases[ph];
      if (sec === 0) { orb.className = 'orb ' + cls; orb.style.transitionDuration = dur + 's'; vibrate(25); }
      txt.innerHTML = `${name}<small>${dur - sec}</small>`;
      rnd.textContent = `Круг ${round + 1} из ${rounds}`;
      sec++;
      if (sec >= dur) {
        sec = 0; ph++;
        if (ph >= phases.length) { ph = 0; round++; if (round >= rounds) finish('Отлично подышал', 'Медленное дыхание успокаивает нервную систему и снижает тягу.'); }
      }
    };
    step();
    every(step, 1000);
  }

  function ground() {
    let i = 0;
    const draw = () => {
      const g = GROUNDING[i];
      body.innerHTML = `<h2>5-4-3-2-1</h2>
        <div class="steps">${GROUNDING.map((_, j) => `<i class="${j < i ? 'done' : j === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="ground fade-in"><b>${g.n}</b><p>${g.text}</p></div>
        <p class="muted">Не торопись. Назови вслух или про себя.</p>
        <button class="btn primary wide" data-next>${i < GROUNDING.length - 1 ? 'Дальше' : 'Готово'}</button>`;
      $('[data-next]', body).onclick = () => { i++; if (i >= GROUNDING.length) finish('Ты здесь и сейчас', 'Техника возвращает внимание из мыслей о тяге в реальный мир.'); else draw(); };
    };
    draw();
  }

  function bubbles() {
    let score = 0, left = 45, combo = 0, lastPop = 0;
    const best = S.best.bubbles || 0;
    body.innerHTML = `<div class="game-head"><span>Очки <b class="sc">0</b></span><span class="combo"></span><span>⏱ <b class="tl">45</b></span></div>
      <div class="field"></div><p class="muted tiny">Золотые пузыри — 5 очков. Лопай быстро подряд — будет комбо. Рекорд: ${best}</p>`;
    const field = $('.field', body), sc = $('.sc', body), tl = $('.tl', body), cb = $('.combo', body);
    const spawn = () => {
      const b = document.createElement('button');
      b.className = 'bubble';
      const size = 46 + Math.random() * 40;
      const golden = Math.random() < 0.08;
      if (golden) b.classList.add('gold');
      b.style.width = b.style.height = size + 'px';
      b.style.left = Math.random() * (field.clientWidth - size) + 'px';
      b.style.animationDuration = Math.max(2.2, 5.5 - (45 - left) * 0.05) + Math.random() * 2 + 's';
      b.onpointerdown = () => {
        const now = performance.now();
        combo = now - lastPop < 700 ? combo + 1 : 1;
        lastPop = now;
        const pts = (golden ? 5 : 1) * (combo >= 5 ? 2 : 1);
        score += pts;
        sc.textContent = score;
        cb.textContent = combo >= 5 ? `комбо ×2` : '';
        vibrate(8);
        b.classList.add('pop');
        b.disabled = true;
        setTimeout(() => b.remove(), 180);
      };
      b.addEventListener('animationend', (e) => { if (e.animationName === 'rise') b.remove(); });
      field.appendChild(b);
    };
    every(spawn, 380);
    every(() => {
      left--; tl.textContent = left;
      if (left <= 0) {
        const rec = score > best;
        if (rec) { S.best.bubbles = score; save(); }
        finish(rec ? `Новый рекорд: ${score}!` : `Очков: ${score}`, 'Руки заняты, голова отвлеклась — тяга теряет силу.');
      }
    }, 1000);
  }

  function memory() {
    const set = shuffle(['🍎', '🌻', '🐳', '🚀', '🎸', '🦊', '⚽', '🍉', '🌈', '🐢', '🎈', '🍀']).slice(0, 8);
    const cards = shuffle([...set, ...set]);
    let open = [], found = 0, moves = 0, lock = false;
    const t0 = Date.now();
    body.innerHTML = `<div class="game-head"><span>Ходы <b class="mv">0</b></span><span>Пары <b class="fd">0</b>/8</span></div>
      <div class="mem">${cards.map((c, i) => `<button class="mcard" data-i="${i}"><span class="mback"></span><span class="mface">${c}</span></button>`).join('')}</div>`;
    const mv = $('.mv', body), fd = $('.fd', body);
    body.addEventListener('click', (e) => {
      const c = e.target.closest('.mcard');
      if (!c || lock || c.classList.contains('open')) return;
      c.classList.add('open');
      open.push(c);
      if (open.length < 2) return;
      moves++; mv.textContent = moves;
      const [a, b] = open;
      if (cards[a.dataset.i] === cards[b.dataset.i]) {
        a.classList.add('ok'); b.classList.add('ok'); open = []; found++; fd.textContent = found; vibrate(20);
        if (found === 8) {
          const sec = Math.round((Date.now() - t0) / 1000);
          const rec = !S.best.memory || moves < S.best.memory;
          if (rec) { S.best.memory = moves; save(); }
          later(() => finish(rec ? `Рекорд: ${moves} ходов!` : `Все пары за ${moves} ходов`, `Ушло ${sec} секунд. Мозг был занят задачей — и тяга отступила.`), 600);
        }
      } else {
        lock = true;
        later(() => { a.classList.remove('open'); b.classList.remove('open'); open = []; lock = false; }, 750);
      }
    });
  }

  function reaction() {
    const rounds = 5;
    let r = 0, state = 'wait', t0 = 0;
    const times = [];
    body.innerHTML = `<div class="game-head"><span>Раунд <b class="rr">1</b>/${rounds}</span><span class="muted">рекорд ${S.best.reaction ? S.best.reaction + ' мс' : '—'}</span></div>
      <button class="react wait"><b>Жди зелёного…</b><small>нажми, как только цвет сменится</small></button>`;
    const pad_ = $('.react', body), rr = $('.rr', body);
    const arm = () => {
      state = 'wait';
      pad_.className = 'react wait';
      pad_.innerHTML = '<b>Жди зелёного…</b><small>не нажимай раньше времени</small>';
      later(() => { if (state !== 'wait') return; state = 'go'; t0 = performance.now(); pad_.className = 'react go'; pad_.innerHTML = '<b>ЖМИ!</b>'; }, 1200 + Math.random() * 2500);
    };
    pad_.onpointerdown = () => {
      if (state === 'wait') {
        state = 'early';
        cleanup();
        pad_.className = 'react early';
        pad_.innerHTML = '<b>Рано!</b><small>нажми, чтобы попробовать ещё</small>';
        return;
      }
      if (state === 'early') return arm();
      if (state === 'go') {
        const ms = Math.round(performance.now() - t0);
        times.push(ms);
        vibrate(15);
        state = 'show';
        pad_.className = 'react show';
        pad_.innerHTML = `<b>${ms} мс</b><small>${r + 1 < rounds ? 'нажми для следующего раунда' : ''}</small>`;
        r++;
        if (r >= rounds) {
          const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
          const rec = !S.best.reaction || avg < S.best.reaction;
          if (rec) { S.best.reaction = avg; save(); }
          later(() => finish(rec ? `Рекорд: ${avg} мс!` : `Средняя реакция: ${avg} мс`, 'Внимание переключилось на игру — тяга потеряла его.'), 900);
        }
        return;
      }
      if (state === 'show' && r < rounds) { rr.textContent = r + 1; arm(); }
    };
    arm();
  }

  function math() {
    let left = 60, score = 0, streak = 0, q;
    const best = S.best.math || 0;
    body.innerHTML = `<div class="game-head"><span>Верно <b class="sc">0</b></span><span>⏱ <b class="tl">60</b></span></div>
      <div class="mq"><b class="mq-text"></b></div><div class="mopts"></div><p class="muted tiny">Рекорд: ${best}</p>`;
    const sc = $('.sc', body), tl = $('.tl', body), qt = $('.mq-text', body), opts = $('.mopts', body);
    const make = () => {
      const lvl = Math.min(3, Math.floor(score / 5));
      const ops = lvl === 0 ? ['+', '−'] : ['+', '−', '×'];
      const op = ops[Math.floor(Math.random() * ops.length)];
      const max = [10, 20, 50, 99][lvl];
      let a = 2 + Math.floor(Math.random() * max), b = 2 + Math.floor(Math.random() * max), ans;
      if (op === '×') { a = 2 + Math.floor(Math.random() * (lvl + 7)); b = 2 + Math.floor(Math.random() * 9); ans = a * b; }
      else if (op === '−') { if (b > a) [a, b] = [b, a]; ans = a - b; }
      else ans = a + b;
      const set = new Set([ans]);
      while (set.size < 4) { const d = ans + (Math.floor(Math.random() * 11) - 5) || ans + 7; if (d >= 0) set.add(d); }
      q = { text: `${a} ${op} ${b}`, ans, opts: shuffle([...set]) };
      qt.textContent = q.text + ' = ?';
      opts.innerHTML = q.opts.map((o) => `<button class="mopt" data-v="${o}">${o}</button>`).join('');
    };
    opts.addEventListener('click', (e) => {
      const b = e.target.closest('.mopt');
      if (!b) return;
      const ok = +b.dataset.v === q.ans;
      b.classList.add(ok ? 'ok' : 'bad');
      if (ok) { score++; streak++; sc.textContent = score; vibrate(10); } else { streak = 0; vibrate([30, 30, 30]); }
      setTimeout(make, ok ? 150 : 400);
    });
    make();
    every(() => {
      left--; tl.textContent = left;
      if (left <= 0) {
        const rec = score > best;
        if (rec) { S.best.math = score; save(); }
        finish(rec ? `Рекорд: ${score} верных!` : `Верных ответов: ${score}`, 'Счёт в уме полностью занимает голову — места для тяги не остаётся.');
      }
    }, 1000);
  }

  function workout() {
    const list = shuffle(WORKOUT).slice(0, 5);
    let i = 0, left = 30, rest = false;
    body.innerHTML = `<h2>Мини-зарядка</h2>
      <div class="steps">${list.map(() => '<i></i>').join('')}</div>
      <div class="ex"><div class="ex-emoji"></div><b class="ex-name"></b><div class="ex-time"></div><p class="muted ex-n"></p></div>
      <button class="btn ghost small center-btn" data-skip>Пропустить</button>`;
    const em = $('.ex-emoji', body), nm = $('.ex-name', body), tm = $('.ex-time', body), n = $('.ex-n', body);
    const dots = [...body.querySelectorAll('.steps i')];
    const draw = () => {
      dots.forEach((d, j) => (d.className = j < i ? 'done' : j === i ? 'on' : ''));
      if (rest) { em.textContent = '😮‍💨'; nm.textContent = 'Отдых'; n.textContent = `Дальше: ${list[i].name}`; }
      else { em.textContent = list[i].emoji; nm.textContent = list[i].name; n.textContent = `Упражнение ${i + 1} из ${list.length}`; }
      tm.textContent = left;
    };
    const next = () => {
      if (rest) { rest = false; left = 30; }
      else { i++; if (i >= list.length) return finish('Зарядка сделана!', 'Движение даёт телу дофамин — честный, без привычки.'); rest = true; left = 10; }
      vibrate([80, 50, 80]);
      draw();
    };
    draw();
    every(() => { left--; if (left <= 3 && left > 0) vibrate(25); if (left <= 0) next(); else draw(); }, 1000);
    $('[data-skip]', body).onclick = () => { left = 0; next(); };
  }

  function task() {
    let last = -1;
    const show = () => {
      let i;
      do i = Math.floor(Math.random() * QUICK_TASKS.length); while (i === last);
      last = i;
      const el = $('.task-text', body);
      el.textContent = QUICK_TASKS[i];
      el.classList.remove('fade-in'); void el.offsetWidth; el.classList.add('fade-in');
    };
    body.innerHTML = `<h2>Быстрое дело</h2>
      <p class="muted">Сделай это прямо сейчас — займёт пару минут.</p>
      <div class="task card glow"><p class="task-text"></p></div>
      <button class="btn primary wide" data-done>Сделал ✓</button>
      <button class="btn ghost wide" data-other>Другое ↻</button>`;
    show();
    $('[data-other]', body).onclick = show;
    $('[data-done]', body).onclick = () => finish('Готово!', 'Маленькое дело — и мысли уже о другом.');
  }

  // Игра с тренировками по камере: рассказать коротко и отправить в браузер или в Telegram-бота.
  function arena() {
    const ARENA = 'https://arena.nikitenok.ru/';
    const BOT = 'https://t.me/ArenaNikitenokBot';
    body.innerHTML = `<div class="arena-promo">
        <img src="arena.png" alt="" width="88" height="88" class="arena-logo pop-in">
        <h2>NikitenokArena</h2>
        <p class="arena-lead">Тяга — это энергия. Потрать её на себя: игра, где каждое твоё движение — удар по врагу.</p>
        <ul class="arena-feats">
          <li><span>📷</span><div><b>Считает по камере</b><small>Отжимания, приседания, пресс и планка — без датчиков, просто поставь телефон</small></div></li>
          <li><span>⚔️</span><div><b>Приключения и дуэли</b><small>Сотни уровней, боссы, бои с живыми соперниками</small></div></li>
          <li><span>🛡️</span><div><b>Кланы и деревня</b><small>Рейды с друзьями, своё поселение и награды</small></div></li>
          <li><span>📈</span><div><b>Видно, как растёшь</b><small>Серии, рекорды и статистика тренировок</small></div></li>
        </ul>
        <p class="muted tiny">Пара подходов — и желание сорваться обычно проходит.</p>
        <a class="btn primary wide" href="${ARENA}" target="_blank" rel="noopener" data-go>🎮 Перейти в игру</a>
        <a class="btn tg wide" href="${BOT}" target="_blank" rel="noopener" data-go>✈️ Открыть бота в Telegram</a>
      </div>`;
    body.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', () => {
      // Вернёшься — спросим, как тяга.
      setTimeout(() => finish('Отличный выбор 💪', 'Тренировка — лучший способ переждать тягу. Возвращайся, когда закончишь.'), 400);
    }));
  }

  function reasons() {
    if (!S.reasons.length) {
      body.innerHTML = `<h2>Мои причины</h2>
        <p>Пока пусто. Напиши хотя бы одну причину, зачем ты отказываешься — в трудный момент она поможет.</p>
        <form class="inline" data-r><input name="r" maxlength="140" placeholder="Зачем я это делаю?" autocomplete="off"><button class="btn primary small">＋</button></form>`;
      $('[data-r]', body).onsubmit = (e) => {
        e.preventDefault();
        const v = e.target.r.value.trim();
        if (v) { S.reasons.push(v); save(); reasons(); }
      };
      return;
    }
    body.innerHTML = `<h2>Вот зачем ты это делаешь</h2>
      <ul class="reason-list">${S.reasons.map((r, i) => `<li style="animation-delay:${i * 0.12}s">❤️ ${esc(r)}</li>`).join('')}</ul>
      <p class="muted">Перечитай медленно. Это важнее пяти минут удовольствия.</p>
      <button class="btn primary wide" data-ok>Я помню ✓</button>`;
    $('[data-ok]', body).onclick = () => finish('Ты помнишь, зачем', 'Причины сильнее привычки, когда они перед глазами.');
  }

  function letter() {
    if (!S.letter) {
      body.innerHTML = `<h2>Письмо себе</h2>
        <p class="muted">Напиши себе на трудный момент. Что ты хочешь сказать себе, когда захочется сорваться?</p>
        <textarea class="letter-input" rows="7" maxlength="1500" placeholder="Привет. Если ты читаешь это, значит, сейчас трудно. Вспомни…"></textarea>
        <button class="btn primary wide" data-save>Сохранить письмо</button>`;
      $('[data-save]', body).onclick = () => {
        const v = $('.letter-input', body).value.trim();
        if (!v) return;
        S.letter = v; S.letterAt = Date.now(); save();
        letter();
      };
      return;
    }
    body.innerHTML = `<h2>Письмо от тебя</h2>
      <div class="letter card">${esc(S.letter).replace(/\n/g, '<br>')}<small class="muted">— ты, ${S.letterAt ? new Date(S.letterAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : 'раньше'}</small></div>
      <button class="btn primary wide" data-ok>Спасибо, я держусь</button>`;
    $('[data-ok]', body).onclick = () => finish('Ты сам себе опора', 'Твои же слова — самый сильный аргумент.');
  }

  return { close };
}
