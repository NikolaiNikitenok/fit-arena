// Сгенерировано из src/game/match3/engine.ts (движок подземелья Арены): npx esbuild src/game/match3/engine.ts --format=esm --target=es2020 --outfile=habit/m3engine.js
const GEM_KINDS = ["wood", "stone", "gold", "heart", "sword"];
const noCounts = () => ({ wood: 0, stone: 0, gold: 0, heart: 0, sword: 0 });
function rand(b) {
  b.rng = b.rng + 1831565813 | 0;
  let t = b.rng;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
const pick = (b, list) => list[Math.floor(rand(b) * list.length)];
const idx = (b, x, y) => y * b.w + x;
const inside = (b, x, y) => x >= 0 && y >= 0 && x < b.w && y < b.h;
const gemAt = (b, x, y) => inside(b, x, y) ? b.cells[idx(b, x, y)].gem : null;
const posOf = (b, i) => ({ x: i % b.w, y: Math.floor(i / b.w) });
function cloneBoard(b) {
  return { ...b, kinds: b.kinds, cells: b.cells.map((c) => ({ gem: c.gem, block: c.block && { ...c.block }, ice: c.ice })) };
}
function newGem(b, kind, special) {
  const g = { id: b.nextId++, kind };
  if (special) g.special = special;
  return g;
}
const matchKind = (g) => g && g.special !== "rainbow" ? g.kind : null;
function createBoard(o) {
  const w = o.w ?? 8;
  const h = o.h ?? 8;
  const b = { w, h, cells: Array.from({ length: w * h }, () => ({ gem: null })), rng: o.seed >>> 0 || 1, nextId: 1, kinds: o.kinds ?? GEM_KINDS };
  for (const bl of o.blocks ?? []) if (inside(b, bl.x, bl.y)) b.cells[idx(b, bl.x, bl.y)].block = { kind: bl.kind, hp: bl.hp ?? (bl.kind === "boulder" ? 2 : 1) };
  for (const ic of o.ice ?? []) {
    const c = inside(b, ic.x, ic.y) && b.cells[idx(b, ic.x, ic.y)];
    if (c && !c.block) c.ice = ic.layers ?? 1;
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    fillClean(b);
    if (hasMove(b)) return b;
  }
  reshuffle(b);
  return b;
}
function fillClean(b) {
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const c = b.cells[idx(b, x, y)];
      if (c.block) continue;
      const bad = (k) => matchKind(gemAt(b, x - 1, y)) === k && matchKind(gemAt(b, x - 2, y)) === k || matchKind(gemAt(b, x, y - 1)) === k && matchKind(gemAt(b, x, y - 2)) === k;
      const ok = b.kinds.filter((k) => !bad(k));
      c.gem = newGem(b, pick(b, ok.length ? ok : b.kinds));
    }
}
function fromRows(rows, seed = 1) {
  const KIND = { w: "wood", s: "stone", g: "gold", h: "heart", x: "sword" };
  const b = { w: rows[0].length, h: rows.length, cells: [], rng: seed, nextId: 1, kinds: GEM_KINDS };
  for (const row2 of rows)
    for (const ch of row2) {
      if (ch === "#" || ch === "@") b.cells.push({ gem: null, block: { kind: ch === "#" ? "crate" : "boulder", hp: ch === "#" ? 1 : 2 } });
      else b.cells.push({ gem: KIND[ch] ? newGem(b, KIND[ch]) : null });
    }
  return b;
}
function toRows(b) {
  const CH = { wood: "w", stone: "s", gold: "g", heart: "h", sword: "x" };
  const rows = [];
  for (let y = 0; y < b.h; y++) {
    let r = "";
    for (let x = 0; x < b.w; x++) {
      const c = b.cells[idx(b, x, y)];
      r += c.block ? c.block.kind === "crate" ? "#" : "@" : !c.gem ? "." : c.gem.special === "rainbow" ? "*" : c.gem.special ? CH[c.gem.kind].toUpperCase() : CH[c.gem.kind];
    }
    rows.push(r);
  }
  return rows;
}
function findRuns(b) {
  const runs = [];
  const scan = (dir) => {
    const outer = dir === "h" ? b.h : b.w;
    const inner = dir === "h" ? b.w : b.h;
    for (let o = 0; o < outer; o++) {
      let start = 0;
      for (let i = 1; i <= inner; i++) {
        const at = (k) => dir === "h" ? idx(b, k, o) : idx(b, o, k);
        const k0 = matchKind(b.cells[at(start)].gem);
        const ki = i < inner ? matchKind(b.cells[at(i)].gem) : null;
        if (ki !== null && ki === k0) continue;
        if (k0 !== null && i - start >= 3) runs.push({ cells: Array.from({ length: i - start }, (_, j) => at(start + j)), dir, kind: k0 });
        start = i;
      }
    }
  };
  scan("h");
  scan("v");
  return runs;
}
function groupRuns(runs) {
  const groups = [];
  for (const r of runs) {
    const hit = groups.filter((g) => g.kind === r.kind && r.cells.some((c) => g.cells.has(c)));
    const merged = { cells: new Set(r.cells), runs: [r], kind: r.kind };
    for (const g of hit) {
      g.cells.forEach((c) => merged.cells.add(c));
      merged.runs.push(...g.runs);
      groups.splice(groups.indexOf(g), 1);
    }
    groups.push(merged);
  }
  return groups;
}
function lineLen(b, x, y, dx, dy) {
  const k = matchKind(gemAt(b, x, y));
  if (k === null) return 0;
  let n = 1;
  for (let s = 1; matchKind(gemAt(b, x + dx * s, y + dy * s)) === k; s++) n++;
  for (let s = 1; matchKind(gemAt(b, x - dx * s, y - dy * s)) === k; s++) n++;
  return n;
}
const matchThrough = (b, x, y) => Math.max(lineLen(b, x, y, 1, 0), lineLen(b, x, y, 0, 1));
const adjacent = (a, c) => Math.abs(a.x - c.x) + Math.abs(a.y - c.y) === 1;
function swapGems(b, a, c) {
  const i = idx(b, a.x, a.y);
  const j = idx(b, c.x, c.y);
  const t = b.cells[i].gem;
  b.cells[i].gem = b.cells[j].gem;
  b.cells[j].gem = t;
}
function canSwap(b, a, c) {
  return inside(b, a.x, a.y) && inside(b, c.x, c.y) && adjacent(a, c) && !!gemAt(b, a.x, a.y) && !!gemAt(b, c.x, c.y);
}
function moveScore(b, a, c) {
  if (!canSwap(b, a, c)) return 0;
  const g1 = gemAt(b, a.x, a.y);
  const g2 = gemAt(b, c.x, c.y);
  if (g1.special === "rainbow" || g2.special === "rainbow") return 10;
  if (g1.special && g2.special) return 8;
  swapGems(b, a, c);
  const n = Math.max(matchThrough(b, a.x, a.y), matchThrough(b, c.x, c.y));
  swapGems(b, a, c);
  return n >= 3 ? n : 0;
}
function findMoves(b) {
  const moves = [];
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++)
      for (const [dx, dy] of [
        [1, 0],
        [0, 1]
      ]) {
        const a = { x, y };
        const c = { x: x + dx, y: y + dy };
        const score = moveScore(b, a, c);
        if (score) moves.push({ a, b: c, score });
      }
  return moves;
}
const hasMove = (b) => findMoves(b).length > 0;
function hint(b) {
  let best = null;
  for (const m of findMoves(b)) if (!best || m.score > best.score || m.score === best.score && m.a.y > best.a.y) best = m;
  return best;
}
function trySwap(input, a, c) {
  if (!canSwap(input, a, c)) return null;
  const b = cloneBoard(input);
  const g1 = gemAt(b, a.x, a.y);
  const g2 = gemAt(b, c.x, c.y);
  const ia = idx(b, a.x, a.y);
  const ic = idx(b, c.x, c.y);
  const seed = { clear: /* @__PURE__ */ new Set(), blasts: [], used: /* @__PURE__ */ new Set() };
  if (g1.special === "rainbow" || g2.special === "rainbow") {
    swapGems(b, a, c);
    seed.used.add(ia).add(ic);
    seed.clear.add(ia).add(ic);
    if (g1.special === "rainbow" && g2.special === "rainbow") {
      seed.blasts.push({ x: c.x, y: c.y, kind: "all" });
      b.cells.forEach((cell, i) => cell.gem && seed.clear.add(i));
    } else {
      const other = g1.special === "rainbow" ? g2 : g1;
      seed.blasts.push({ x: c.x, y: c.y, kind: "rainbow", target: other.kind });
      b.cells.forEach((cell, i) => {
        if (!cell.gem || cell.gem.kind !== other.kind || cell.gem.special === "rainbow") return;
        if (other.special && i !== ia && i !== ic) cell.gem = { ...cell.gem, special: other.special === "bomb" ? "bomb" : rand(b) < 0.5 ? "lineH" : "lineV" };
        seed.clear.add(i);
      });
      if (other.special) seed.used.delete(other === g1 ? ic : ia);
    }
  } else if (g1.special && g2.special) {
    swapGems(b, a, c);
    seed.used.add(ia).add(ic);
    seed.clear.add(ia).add(ic);
    const bombs = Number(g1.special === "bomb") + Number(g2.special === "bomb");
    const area = /* @__PURE__ */ new Set();
    if (bombs === 2) {
      seed.blasts.push({ ...c, kind: "bigbomb" });
      square(b, c.x, c.y, 2, area);
    } else if (bombs === 1) {
      for (let d = -1; d <= 1; d++) {
        row(b, c.y + d, area);
        col(b, c.x + d, area);
      }
      seed.blasts.push({ ...c, kind: "row" }, { ...c, kind: "col" });
    } else {
      row(b, c.y, area);
      col(b, c.x, area);
      seed.blasts.push({ ...c, kind: "row" }, { ...c, kind: "col" });
    }
    area.forEach((i) => seed.clear.add(i));
  } else {
    swapGems(b, a, c);
    if (matchThrough(b, a.x, a.y) < 3 && matchThrough(b, c.x, c.y) < 3) return null;
  }
  return cascade(b, seed, [ic, ia]);
}
function cascade(b, seed, prefer) {
  const steps = [];
  const counts = noCounts();
  let first = seed;
  for (let combo = 1; combo < 50; combo++) {
    const groups = groupRuns(findRuns(b));
    if (!groups.length && !(first && first.clear.size)) break;
    const s = resolveStep(b, groups, first, prefer, combo);
    first = null;
    prefer = [];
    steps.push(s);
    for (const k of GEM_KINDS) counts[k] += s.counts[k];
  }
  let reshuffled = false;
  if (!hasMove(b)) {
    reshuffle(b);
    reshuffled = true;
  }
  return { board: b, steps, counts, combo: steps.length, reshuffled };
}
function finale(input, n) {
  const b = cloneBoard(input);
  const plain = b.cells.map((c, i) => c.gem && !c.gem.special ? i : -1).filter((i) => i >= 0);
  const marked = [];
  for (let k = 0; k < n && plain.length; k++) {
    const i = plain.splice(Math.floor(rand(b) * plain.length), 1)[0];
    const gem = { ...b.cells[i].gem, special: rand(b) < 0.5 ? "lineH" : "lineV" };
    b.cells[i].gem = gem;
    marked.push({ ...posOf(b, i), gem });
  }
  const seed = { clear: /* @__PURE__ */ new Set(), blasts: [], used: /* @__PURE__ */ new Set() };
  b.cells.forEach((c, i) => c.gem?.special && seed.clear.add(i));
  if (!seed.clear.size) return null;
  const start = cloneBoard(b);
  return { marked, start, result: cascade(b, seed, []) };
}
const row = (b, y, out) => {
  if (y >= 0 && y < b.h) for (let x = 0; x < b.w; x++) out.add(idx(b, x, y));
};
const col = (b, x, out) => {
  if (x >= 0 && x < b.w) for (let y = 0; y < b.h; y++) out.add(idx(b, x, y));
};
const square = (b, cx, cy, r, out) => {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (inside(b, x, y)) out.add(idx(b, x, y));
};
function commonKind(b) {
  const n = noCounts();
  for (const c of b.cells) if (c.gem && c.gem.special !== "rainbow") n[c.gem.kind]++;
  return GEM_KINDS.reduce((best, k) => n[k] > n[best] ? k : best, b.kinds[0]);
}
function resolveStep(b, groups, seed, prefer, combo) {
  const clear = new Set(seed?.clear);
  const blasts = [...seed?.blasts ?? []];
  const used = new Set(seed?.used);
  const created = [];
  const matched = /* @__PURE__ */ new Set();
  let longest = 0;
  for (const g of groups) {
    g.cells.forEach((i) => {
      clear.add(i);
      matched.add(i);
    });
    const max = Math.max(...g.runs.map((r) => r.cells.length));
    longest = Math.max(longest, max);
    const cross = g.runs.some((r) => r.dir === "h") && g.runs.some((r) => r.dir === "v");
    const special = max >= 5 ? "rainbow" : cross ? "bomb" : max === 4 ? g.runs.find((r) => r.cells.length === 4).dir === "h" ? "lineV" : "lineH" : null;
    if (!special) continue;
    let at = prefer.find((i) => g.cells.has(i));
    if (at === void 0 && cross) {
      const h = g.runs.filter((r) => r.dir === "h").flatMap((r) => r.cells);
      at = g.runs.filter((r) => r.dir === "v").flatMap((r) => r.cells).find((i) => h.includes(i));
    }
    if (at === void 0) {
      const long = g.runs.reduce((a, r) => r.cells.length > a.cells.length ? r : a);
      at = long.cells[Math.floor((long.cells.length - 1) / 2)];
    }
    created.push({ ...posOf(b, at), gem: newGem(b, g.kind, special) });
  }
  const queue = [...clear];
  while (queue.length) {
    const i = queue.shift();
    const gem = b.cells[i].gem;
    if (!gem?.special || used.has(i)) continue;
    used.add(i);
    const p = posOf(b, i);
    const area = /* @__PURE__ */ new Set();
    if (gem.special === "lineH") {
      row(b, p.y, area);
      blasts.push({ ...p, kind: "row" });
    } else if (gem.special === "lineV") {
      col(b, p.x, area);
      blasts.push({ ...p, kind: "col" });
    } else if (gem.special === "bomb") {
      square(b, p.x, p.y, 1, area);
      blasts.push({ ...p, kind: "bomb" });
    } else {
      const target = commonKind(b);
      b.cells.forEach((c, j) => c.gem && c.gem.kind === target && c.gem.special !== "rainbow" && area.add(j));
      blasts.push({ ...p, kind: "rainbow", target });
    }
    area.forEach((j) => {
      if (!clear.has(j)) {
        clear.add(j);
        queue.push(j);
      }
    });
  }
  const hitBlocks = /* @__PURE__ */ new Set();
  matched.forEach((i) => {
    const p = posOf(b, i);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ])
      if (inside(b, p.x + dx, p.y + dy) && b.cells[idx(b, p.x + dx, p.y + dy)].block) hitBlocks.add(idx(b, p.x + dx, p.y + dy));
  });
  clear.forEach((i) => b.cells[i].block && hitBlocks.add(i));
  const blocksHit = [];
  hitBlocks.forEach((i) => {
    const bl = b.cells[i].block;
    bl.hp -= 1;
    blocksHit.push({ ...posOf(b, i), kind: bl.kind, hp: Math.max(0, bl.hp) });
    if (bl.hp <= 0) delete b.cells[i].block;
  });
  const cleared = [];
  const iceHit = [];
  const counts = noCounts();
  clear.forEach((i) => {
    const c = b.cells[i];
    if (!c.gem) return;
    cleared.push({ ...posOf(b, i), id: c.gem.id, kind: c.gem.kind, special: c.gem.special });
    if (c.gem.special !== "rainbow") counts[c.gem.kind]++;
    c.gem = null;
    if (c.ice) {
      c.ice -= 1;
      iceHit.push({ ...posOf(b, i), left: c.ice });
      if (!c.ice) delete c.ice;
    }
  });
  for (const cr of created) {
    const c = b.cells[idx(b, cr.x, cr.y)];
    if (!c.block) c.gem = cr.gem;
  }
  const mid = cloneBoard(b);
  const { falls, spawned } = gravity(b);
  return { combo, cleared, created, blasts, blocksHit, iceHit, counts, longest, mid, after: cloneBoard(b), falls, spawned };
}
function gravity(b) {
  const falls = [];
  const spawned = [];
  for (let x = 0; x < b.w; x++) {
    const open = [];
    for (let y = b.h - 1; y >= 0; y--) if (!b.cells[idx(b, x, y)].block) open.push(y);
    const gems = [];
    for (const y of open) {
      const g = b.cells[idx(b, x, y)].gem;
      if (g) gems.push({ gem: g, y });
    }
    const missing = open.length - gems.length;
    open.forEach((y, k) => {
      const c = b.cells[idx(b, x, y)];
      if (k < gems.length) {
        c.gem = gems[k].gem;
        if (gems[k].y !== y) falls.push({ id: c.gem.id, x, from: gems[k].y, to: y });
      } else {
        c.gem = newGem(b, pick(b, b.kinds));
        spawned.push({ id: c.gem.id, x, y, drop: missing });
      }
    });
  }
  return { falls, spawned };
}
function reshuffle(b) {
  const spots = b.cells.map((c, i) => c.gem ? i : -1).filter((i) => i >= 0);
  for (let attempt = 0; attempt < 100; attempt++) {
    const gems = spots.map((i) => b.cells[i].gem);
    for (let i = gems.length - 1; i > 0; i--) {
      const j = Math.floor(rand(b) * (i + 1));
      [gems[i], gems[j]] = [gems[j], gems[i]];
    }
    spots.forEach((s, k) => b.cells[s].gem = gems[k]);
    if (!findRuns(b).length && hasMove(b)) return;
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    fillClean(b);
    if (hasMove(b)) return;
  }
}
export {
  GEM_KINDS,
  adjacent,
  canSwap,
  cloneBoard,
  createBoard,
  finale,
  findMoves,
  findRuns,
  fromRows,
  gemAt,
  hasMove,
  hint,
  idx,
  inside,
  noCounts,
  reshuffle,
  toRows,
  trySwap
};
