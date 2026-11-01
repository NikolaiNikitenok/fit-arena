// Страница статистики для админов: простой HTML без скриптов, в цветах приложения.
// Тексты ошибок приходят с телефонов, поэтому всё экранируется.
import { GONE_DAYS, type Telemetry } from './telemetry';

type Stats = ReturnType<Telemetry['stats']>;

export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const pct = (n: number | null, of: number) => (n == null ? '—' : of ? `${Math.round((n / of) * 100)}%` : '0%');
const when = (t: number) => new Date(t + 3 * 3_600_000).toISOString().slice(5, 16).replace('T', ' ');
const short = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;

// Понятные имена источников; свои метки (src-МЕТКА) показываем как есть.
const SOURCE_NAMES: Record<string, string> = {
  direct: 'Бот или меню Telegram',
  friend: 'Приглашение друга',
  clan: 'Приглашение в клан',
  duel: 'Вызов на дуэль',
  bot: 'Кнопка из уведомления бота',
  channel: 'Канал NikitenokArena',
  threads: 'Threads',
  group: 'Вызов в групповом чате',
  share: 'Карточка «Повержен босс»',
  web: 'Сайт в браузере',
  max: 'Max',
  unknown: 'Неизвестно',
  other: 'Прочие метки',
};
export const sourceName = (o: string) => SOURCE_NAMES[o] ?? (o.startsWith('ch-') ? `Канал: ${o.slice(3)}` : o.startsWith('th-') ? `Threads: ${o.slice(3)}` : `Метка «${o}»`);

// Продвижение за деньги (каталоги, взаимная реклама, Telegram Ads) — только когда D1 дошёл до этой доли.
export const PROMO_D1 = 0.25;
// И когда новичков достаточно, чтобы доле можно было верить.
export const PROMO_MIN_COHORT = 30;

/** Можно ли платить за игроков: D1 за последние дни против ориентира плана (этап 4). */
export function promoGate(d1: number, cohort: number): { ok: boolean; text: string } {
  if (cohort < PROMO_MIN_COHORT) return { ok: false, text: `Продвижение в Telegram: рано судить — новичков с известным D1 пока ${cohort}, нужно хотя бы ${PROMO_MIN_COHORT}.` };
  const pctText = `${Math.round((d1 / cohort) * 100)}%`;
  return d1 / cohort >= PROMO_D1
    ? { ok: true, text: `Продвижение в Telegram: можно — D1 ${pctText} (ориентир ${PROMO_D1 * 100}%). Каталоги мини-приложений, взаимная реклама с фитнес-каналами, небольшой тест Telegram Ads со своей меткой src-.` }
    : { ok: false, text: `Продвижение в Telegram: рано — D1 ${pctText}, нужно ${PROMO_D1 * 100}%. Платить за игроков, которые уходят в первый день, бессмысленно: сначала удержание.` };
}

export interface ContentRow {
  source: string;
  users: number;
  d1Of: number;
  d1: number;
  keep: boolean;
}

/** «Контент по цифрам»: метки постов (ch-, th-, канал, Threads, рилсы) — сколько пришло и сколько вернулось назавтра.
 *  «Оставить» — два формата, которые дают больше всего вернувшихся (не кликов). */
export function contentRows(sources: Stats['sources']): ContentRow[] {
  const rows = sources.filter((x) => /^(ch-|th-|reel|story|carousel|insta)/.test(x.source) || x.source === 'channel' || x.source === 'threads');
  const best = [...rows]
    .filter((x) => x.d1 > 0)
    .sort((a, b) => b.d1 - a.d1 || b.d1 / Math.max(1, b.d1Of) - a.d1 / Math.max(1, a.d1Of))
    .slice(0, 2)
    .map((x) => x.source);
  return rows.map((x) => ({ source: x.source, users: x.users, d1Of: x.d1Of, d1: x.d1, keep: best.includes(x.source) })).sort((a, b) => b.d1 - a.d1 || b.users - a.users);
}

/** Шаг воронки с самой большой потерей против предыдущего; 0 — потерь нет.
 *  Последний шаг («вернулись в другой день») не сравниваем: он про другое. */
export function worstStep(funnel: Stats['funnel']): number {
  let worst = 0;
  let most = 0;
  for (let i = 1; i < funnel.length - 1; i++) {
    const lost = funnel[i - 1].users - funnel[i].users;
    if (lost > most) [worst, most] = [i, lost];
  }
  return worst;
}

/** Выводы для блока «Главное»: что сейчас важнее всего, простыми словами. */
export function insights(s: Stats): string[] {
  const out: string[] = [];
  const newcomers = s.funnel[0]?.users ?? 0;
  if (!newcomers) return [`За ${s.days} дней новых игроков не было: выводов пока нет.`];
  out.push(`За ${s.days} дней пришло ${newcomers} новичков.`);
  const w = worstStep(s.funnel);
  if (w) {
    const [from, to] = [s.funnel[w - 1], s.funnel[w]];
    const lost = from.users - to.users;
    out.push(`Больше всего новичков теряем между шагами «${from.label}» и «${to.label}»: не дошли ${lost} из ${from.users} (${pct(lost, from.users)}). Это место стоит улучшать первым.`);
  }
  const back = s.funnel[s.funnel.length - 1];
  if (back) out.push(`Вернулись в другой день ${back.users} из ${newcomers} (${pct(back.users, newcomers)}).`);
  const top = s.sources[0];
  if (top) out.push(`Больше всего новичков пришло через «${sourceName(top.source)}»: ${top.users}.`);
  const best = s.sources.filter((x) => x.users >= 5).sort((a, b) => b.won / b.users - a.won / a.users)[0];
  if (best && s.sources.filter((x) => x.users >= 5).length > 1) out.push(`Лучше всех играют пришедшие через «${sourceName(best.source)}»: первую победу одержали ${pct(best.won, best.users)}.`);
  const gone = s.reach.reduce((a, r) => a + r.gone, 0);
  const stop = [...s.reach].sort((a, b) => b.gone - a.gone)[0];
  if (gone && stop) out.push(`Ушли (не заходят 3+ дня) ${gone} новичков; чаще всего на этапе «${stop.label}» — ${stop.gone} человек.`);
  return out;
}

/** Столбики DAU за 30 дней; подсказка у каждого столбика — в title. */
function dauChart(dau: Stats['dau']): string {
  const W = 640;
  const H = 180;
  const top = 14;
  const bottom = 22;
  const left = 30;
  const max = Math.max(4, ...dau.map((d) => d.users));
  const step = Math.ceil(max / 4);
  const ceil = step * 4;
  const bw = (W - left) / dau.length;
  const y = (v: number) => top + (H - top - bottom) * (1 - v / ceil);
  const grid = [0, 1, 2, 3, 4]
    .map((i) => `<line x1="${left}" x2="${W}" y1="${y(i * step)}" y2="${y(i * step)}" class="grid"/><text x="${left - 6}" y="${y(i * step) + 4}" class="ax" text-anchor="end">${i * step}</text>`)
    .join('');
  const bars = dau
    .map((d, i) => {
      const x = left + i * bw + 1;
      const h = Math.max(0, y(0) - y(d.users));
      const w = Math.max(2, bw - 2);
      const r = Math.min(4, w / 2, h);
      // Скругляем только верх, низ стоит на нуле.
      const path = h > 0 ? `M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} z` : '';
      const label = i % 5 === dau.length % 5 || i === dau.length - 1 ? `<text x="${x + w / 2}" y="${H - 6}" class="ax" text-anchor="middle">${short(d.date)}</text>` : '';
      return `<g><title>${short(d.date)}: ${d.users} игроков, новых ${d.newUsers}, ошибок ${d.errors}</title><rect x="${x - 1}" y="${top}" width="${bw}" height="${H - top - bottom}" fill="transparent"/>${path ? `<path d="${path}" class="bar"/>` : ''}</g>${label}`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Игроков в день за 30 дней">${grid}${bars}</svg>`;
}

export function statsHtml(s: Stats, opts: { inApp?: boolean } = {}): string {
  const last = s.dau[s.dau.length - 1];
  const yest = s.dau[s.dau.length - 2];
  const new7 = s.dau.slice(-7).reduce((a, d) => a + d.newUsers, 0);
  const errors7 = s.dau.slice(-7).reduce((a, d) => a + d.errors, 0);
  const sum = (k: string) => s.dau.slice(-7).reduce((a, d) => a + (d.events[k] ?? 0), 0);
  const ret = s.retention.filter((r) => r.cohort > 0);
  const d1 = ret.filter((r) => r.d1 != null);
  const d1Rate = d1.length ? d1.reduce((a, r) => a + r.d1!, 0) / Math.max(1, d1.reduce((a, r) => a + r.cohort, 0)) : null;
  const funnelMax = Math.max(1, s.funnel[0]?.users ?? 1);
  const tile = (label: string, value: string, note = '') => `<div class="tile"><div class="tl">${esc(label)}</div><div class="tv">${esc(value)}</div>${note ? `<div class="tn">${esc(note)}</div>` : ''}</div>`;
  const worst = worstStep(s.funnel);
  const hardest = s.levels
    .filter((l) => l.win + l.lose >= 5)
    .map((l) => ({ ...l, rate: l.lose / (l.win + l.lose) }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8);

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Статистика NikitenokArena</title>
<style>
:root{--bg:#0d0f17;--surface:#161925;--surface-2:#1e2231;--line:rgba(255,255,255,.07);--text:#f5f2ec;--hint:#98a0b3;--accent:#ff8a5c;--rose:#ff6b81;--mint:#6ee7b7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 Nunito,system-ui,-apple-system,sans-serif}
main{max-width:760px;margin:0 auto;padding:${opts.inApp ? '12px' : '24px'} 16px 40px}
h1{font-size:22px;margin:0 0 4px;font-weight:900}h2{font-size:16px;margin:28px 0 10px;font-weight:900}
.muted{color:var(--hint);font-size:13px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-top:16px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:10px 12px}
.tl{color:var(--hint);font-size:12px;font-weight:700}.tv{font-size:24px;font-weight:900;font-variant-numeric:tabular-nums}.tn{color:var(--hint);font-size:12px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:12px}
svg{width:100%;height:auto;display:block}.grid{stroke:rgba(255,255,255,.06)}.ax{fill:var(--hint);font-size:11px}.bar{fill:var(--accent)}g:hover .bar{fill:#ffb46b}
table{width:100%;border-collapse:collapse;font-size:13.5px;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--hint);font-weight:700;font-size:12px}td.n,th.n{text-align:right}
.hint{color:var(--hint);font-size:13px;margin:-4px 0 10px}code{background:var(--surface-2);padding:1px 5px;border-radius:6px;font-size:12px;word-break:break-all}
.main{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:12px 14px 12px 30px;margin:0}.main li{margin:4px 0}
.lost{color:var(--hint);font-size:12px}.lost.bad{color:var(--rose);font-weight:800}.fill.bad{background:var(--rose)}
.fun{display:grid;grid-template-columns:minmax(120px,1.4fr) 2fr auto;gap:6px 10px;align-items:center;font-size:13.5px}
.track{height:10px;border-radius:5px;background:var(--surface-2);overflow:hidden}.fill{height:100%;border-radius:5px;background:var(--accent)}
.err{padding:10px 0;border-bottom:1px solid var(--line)}.err:last-child{border:0}
.em{font-weight:800;word-break:break-word}.ek{display:inline-block;font-size:11px;font-weight:800;padding:1px 7px;border-radius:8px;background:var(--surface-2);color:var(--hint);margin-right:6px}
.ec{color:var(--rose);font-weight:900}details{margin-top:4px}summary{color:var(--hint);font-size:12px;cursor:pointer}
pre{white-space:pre-wrap;word-break:break-all;font-size:11.5px;color:#c9cfda;background:var(--surface-2);padding:8px;border-radius:10px;margin:6px 0 0}
.scroll{overflow-x:auto}
</style></head><body><main>
<h1>Статистика</h1>
<div class="muted">Сегодня ${esc(s.today)} по Москве · всего игроков за 120 дней: ${s.totalUsers}. Только анонимные счётчики.</div>
<div class="tiles">
${tile('Игроков сегодня', String(last?.users ?? 0), `вчера ${yest?.users ?? 0}`)}
${tile('Новых за 7 дней', String(new7))}
${tile('Удержание D1', d1Rate == null ? '—' : `${Math.round(d1Rate * 100)}%`, 'вернулись на следующий день')}
${tile('Ошибок за 7 дней', String(errors7), `${s.errors.length} разных`)}
</div>

<div class="hint" style="margin-top:12px">${esc(promoGate(d1.reduce((a, r) => a + r.d1!, 0), d1.reduce((a, r) => a + r.cohort, 0)).text)}</div>

<h2>Главное</h2>
<ul class="main">${insights(s).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>

<h2>Игроков в день, 30 дней</h2>
<div class="hint">Сколько разных людей заходило в каждый день. Наведи или нажми на столбик — там же новые и ошибки.</div>
<div class="card">${dauChart(s.dau)}</div>

<h2>За 7 дней</h2>
<div class="card scroll"><table>
<tr><th>Событие</th><th class="n">Раз</th></tr>
<tr><td>Уровней начато</td><td class="n">${sum('mission_start')}</td></tr>
<tr><td>Побед / поражений</td><td class="n">${sum('mission_win')} / ${sum('mission_lose')}</td></tr>
<tr><td>Камера: разрешили / отказали</td><td class="n">${sum('camera_granted')} / ${sum('camera_denied')}</td></tr>
<tr><td>Дуэли · рейды · программы · события</td><td class="n">${sum('duel_start')} · ${sum('raid_start')} · ${sum('program_start')} · ${sum('event_start')}</td></tr>
<tr><td>Итоги месяца: открыли / поделились</td><td class="n">${sum('recap_open')} / ${sum('recap_share')}</td></tr>
<tr><td>Telegram: в чат / ярлык на экран / emoji-статус</td><td class="n">${sum('share_chat')} / ${sum('home_shortcut')} / ${sum('emoji_status')}</td></tr>
<tr><td>Письма бота: ушло / вернулись по ним / подарков забрали</td><td class="n">${sum('letter_sent')} / ${sum('letter_open')} / ${sum('gift_claim')}</td></tr>
<tr><td>Бои с «призраком»: победы / поражения</td><td class="n">${sum('ghost_fight:win')} / ${sum('ghost_fight:lose')}</td></tr>
<tr><td>Вызовы в чатах: начато / вступили</td><td class="n">${sum('group_start')} / ${sum('group_join:ok')}</td></tr>
<tr><td>«Позови троих» после победы: показано / нажали</td><td class="n">${sum('invite_card:show')} / ${sum('invite_card:tap')}</td></tr>
</table></div>

<h2>Воронка новичка: где уходят</h2>
<div class="hint">Новички за ${s.days} дней. Каждая строка — сколько из них дошли до шага; «−N» — сколько потеряли по сравнению с предыдущим шагом. Красным — самая большая потеря: улучшать стоит её.</div>
<div class="card fun">
${s.funnel
  .map((f, i) => {
    const lost = i && i < s.funnel.length - 1 ? Math.max(0, s.funnel[i - 1].users - f.users) : 0;
    return `<div>${esc(f.label)}</div><div class="track"><div class="fill${i === worst ? ' bad' : ''}" style="width:${((f.users / funnelMax) * 100).toFixed(1)}%"></div></div><div class="n">${f.users} · ${pct(f.users, funnelMax)}${lost ? ` <span class="${i === worst ? 'lost bad' : 'lost'}">−${lost}</span>` : ''}</div>`;
  })
  .join('\n')}
</div>

<h2>Откуда пришли</h2>
<div class="hint">Новички за ${s.days} дней по источнику первого входа (считается с ${esc(s.trackSince)}). Своя ссылка для рекламы или блогера: <code>t.me/ArenaNikitenokBot?start=src-МЕТКА</code>, например <code>src-vk</code> или <code>src-blogger1</code> — метка появится здесь отдельной строкой.</div>
<div class="card scroll"><table>
<tr><th>Источник</th><th class="n">Новых</th><th class="n">Камера</th><th class="n">1-я победа</th><th class="n">Дуэль и др.</th><th class="n">D1</th></tr>
${s.sources.map((x) => `<tr><td>${esc(sourceName(x.source))}</td><td class="n">${x.users}</td><td class="n">${pct(x.camera, x.users)}</td><td class="n">${pct(x.won, x.users)}</td><td class="n">${pct(x.played, x.users)}</td><td class="n">${x.d1Of ? pct(x.d1, x.d1Of) : '—'}</td></tr>`).join('\n') || '<tr><td colspan="6" class="muted">Пока нет данных</td></tr>'}
</table></div>

<h2>Контент по цифрам</h2>
<div class="hint">У каждого поста своя метка: <code>ch-рубрика</code> — канал, <code>th-рубрика</code> — Threads. Считаем не лайки, а сколько новичков пришло и сколько вернулось на следующий день. Через две недели оставляем два формата с пометкой «оставить».</div>
<div class="card scroll"><table>
<tr><th>Формат</th><th class="n">Новых</th><th class="n">Вернулись (D1)</th><th></th></tr>
${contentRows(s.sources).map((x) => `<tr><td>${esc(sourceName(x.source))}</td><td class="n">${x.users}</td><td class="n">${x.d1Of ? `${x.d1} · ${pct(x.d1, x.d1Of)}` : '—'}</td><td>${x.keep ? '<b>оставить</b>' : ''}</td></tr>`).join('\n') || '<tr><td colspan="4" class="muted">Пока никто не пришёл по меткам постов</td></tr>'}
</table></div>

<h2>До какого уровня дошли</h2>
<div class="hint">Те же новички по самому дальнему пройденному уровню. «Ушли» — не заходят ${GONE_DAYS}+ дня, «играют» — заходили недавно. Много ушедших на одном этапе — значит, там скучно, трудно или непонятно.</div>
<div class="card scroll"><table>
<tr><th>Пройдено</th><th class="n">Ушли</th><th class="n">Играют</th></tr>
${s.reach.map((r) => `<tr><td>${esc(r.label)}</td><td class="n">${r.gone ? `<b>${r.gone}</b>` : 0}</td><td class="n">${r.playing}</td></tr>`).join('\n')}
</table></div>

<h2>Удержание по дню первого входа</h2>
<div class="hint">Строка — люди, впервые зашедшие в этот день. D1 — какая доля вернулась на следующий день, D7 — через неделю. Ориентир для игр: D1 30–40%, D7 10–15%.</div>
<div class="card scroll"><table>
<tr><th>Когорта</th><th class="n">Новых</th><th class="n">D1</th><th class="n">D7</th></tr>
${ret.slice(0, 14).map((r) => `<tr><td>${esc(r.date)}</td><td class="n">${r.cohort}</td><td class="n">${pct(r.d1, r.cohort)}</td><td class="n">${pct(r.d7, r.cohort)}</td></tr>`).join('\n') || '<tr><td colspan="4" class="muted">Пока нет данных</td></tr>'}
</table></div>

${
  hardest.length
    ? `<h2>Самые трудные уровни</h2>
<div class="hint">Уровни, где чаще всего проигрывают (минимум 5 боёв). Если проигрывают больше половины — уровень стоит облегчить.</div>
<div class="card scroll"><table>
<tr><th>Уровень</th><th class="n">Начато</th><th class="n">Побед</th><th class="n">Поражений</th></tr>
${hardest.map((l) => `<tr><td>${l.id}</td><td class="n">${l.start}</td><td class="n">${l.win}</td><td class="n">${l.lose} · ${Math.round(l.rate * 100)}%</td></tr>`).join('\n')}
</table></div>`
    : ''
}

<h2>Ошибки</h2>
<div class="card">
${
  s.errors
    .slice(0, 30)
    .map(
      (e) => `<div class="err"><div><span class="ek">${esc(e.kind)}</span><span class="ec">${e.count}×</span> <span class="em">${esc(e.message)}</span></div>
<div class="muted">${esc(e.frame || 'без стека')} · впервые ${when(e.firstSeen)} · последний раз ${when(e.lastSeen)} · версии ${esc(e.versions.join(', '))}</div>
<details><summary>Пример: ${esc(e.sample.platform)} · ${esc(e.sample.screen)}${e.sample.lowPower ? ' · экономия батареи' : ''}</summary><pre>${esc(e.sample.ua)}\n${esc(e.sample.path)}\n\n${esc(e.sample.stack || '—')}</pre></details></div>`,
    )
    .join('\n') || '<div class="muted">Ошибок нет</div>'
}
</div>
</main></body></html>`;
}
