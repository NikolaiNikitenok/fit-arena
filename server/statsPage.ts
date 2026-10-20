// Страница статистики для админов: простой HTML без скриптов, в цветах приложения.
// Тексты ошибок приходят с телефонов, поэтому всё экранируется.
import type { Telemetry } from './telemetry';

type Stats = ReturnType<Telemetry['stats']>;

export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const pct = (n: number | null, of: number) => (n == null ? '—' : of ? `${Math.round((n / of) * 100)}%` : '0%');
const when = (t: number) => new Date(t + 3 * 3_600_000).toISOString().slice(5, 16).replace('T', ' ');
const short = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;

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
${tile('Удержание D1', d1Rate == null ? '—' : `${Math.round(d1Rate * 100)}%`, 'среднее по когортам')}
${tile('Ошибок за 7 дней', String(errors7), `${s.errors.length} разных`)}
</div>

<h2>Игроков в день, 30 дней</h2>
<div class="card">${dauChart(s.dau)}</div>

<h2>За 7 дней</h2>
<div class="card scroll"><table>
<tr><th>Событие</th><th class="n">Раз</th></tr>
<tr><td>Уровней начато</td><td class="n">${sum('mission_start')}</td></tr>
<tr><td>Побед / поражений</td><td class="n">${sum('mission_win')} / ${sum('mission_lose')}</td></tr>
<tr><td>Камера: разрешили / отказали</td><td class="n">${sum('camera_granted')} / ${sum('camera_denied')}</td></tr>
<tr><td>Дуэли · рейды · программы · события</td><td class="n">${sum('duel_start')} · ${sum('raid_start')} · ${sum('program_start')} · ${sum('event_start')}</td></tr>
</table></div>

<h2>Воронка новичка</h2>
<div class="card fun">
${s.funnel.map((f) => `<div>${esc(f.label)}</div><div class="track"><div class="fill" style="width:${((f.users / funnelMax) * 100).toFixed(1)}%"></div></div><div class="n">${f.users} · ${pct(f.users, funnelMax)}</div>`).join('\n')}
</div>

<h2>Удержание по дню первого входа</h2>
<div class="card scroll"><table>
<tr><th>Когорта</th><th class="n">Новых</th><th class="n">D1</th><th class="n">D7</th></tr>
${ret.slice(0, 14).map((r) => `<tr><td>${esc(r.date)}</td><td class="n">${r.cohort}</td><td class="n">${pct(r.d1, r.cohort)}</td><td class="n">${pct(r.d7, r.cohort)}</td></tr>`).join('\n') || '<tr><td colspan="4" class="muted">Пока нет данных</td></tr>'}
</table></div>

${
  hardest.length
    ? `<h2>Где бросают: самые трудные уровни</h2>
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
