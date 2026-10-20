import { describe, expect, it } from 'vitest';
import { type Board, cloneBoard, createBoard, findMoves, findRuns, fromRows, gemAt, hasMove, hint, idx, reshuffle, toRows, trySwap } from './engine';

const special = (b: Board, x: number, y: number, s: 'lineH' | 'lineV' | 'bomb' | 'rainbow') => {
  const c = b.cells[idx(b, x, y)];
  c.gem = { ...c.gem!, special: s };
  return b;
};
const gemCount = (b: Board) => b.cells.filter((c) => c.gem).length;
const openCount = (b: Board) => b.cells.filter((c) => !c.block).length;

describe('новая доска', () => {
  it('без готовых совпадений и с ходом — на сотне зёрен', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const b = createBoard({ seed, w: 8, h: 8 });
      expect(findRuns(b)).toHaveLength(0);
      expect(hasMove(b)).toBe(true);
      expect(gemCount(b)).toBe(64);
    }
  });
  it('то же зерно — та же доска', () => {
    expect(toRows(createBoard({ seed: 42 }))).toEqual(toRows(createBoard({ seed: 42 })));
    expect(toRows(createBoard({ seed: 42 }))).not.toEqual(toRows(createBoard({ seed: 43 })));
  });
  it('ящики и лёд встают на место, в ящике самоцвета нет', () => {
    const b = createBoard({ seed: 5, w: 7, h: 8, blocks: [{ x: 3, y: 3, kind: 'crate' }, { x: 4, y: 3, kind: 'boulder' }], ice: [{ x: 0, y: 7, layers: 2 }] });
    expect(b.w).toBe(7);
    expect(b.cells[idx(b, 3, 3)].gem).toBeNull();
    expect(b.cells[idx(b, 4, 3)].block).toEqual({ kind: 'boulder', hp: 2 });
    expect(b.cells[idx(b, 0, 7)].ice).toBe(2);
    expect(findRuns(b)).toHaveLength(0);
  });
});

describe('совпадения', () => {
  it('три в ряд убираются, ход без совпадения не засчитывается', () => {
    const b = fromRows(['wwsg', 'hgwx', 'sxhg', 'ghsx']);
    expect(trySwap(b, { x: 2, y: 0 }, { x: 2, y: 1 })).not.toBeNull();
    expect(trySwap(b, { x: 0, y: 3 }, { x: 1, y: 3 })).toBeNull();
    // Не соседи и не по диагонали.
    expect(trySwap(b, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
    expect(trySwap(b, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });
  it('считает убранные самоцветы по видам, доска на входе не меняется', () => {
    const b = fromRows(['xxsg', 'hgxw', 'sghs', 'ghsw']);
    const before = toRows(b);
    const r = trySwap(b, { x: 2, y: 0 }, { x: 2, y: 1 })!;
    expect(r.steps[0].counts.sword).toBe(3);
    expect(r.counts.sword).toBeGreaterThanOrEqual(3);
    expect(toRows(b)).toEqual(before);
    expect(gemCount(r.board)).toBe(16);
  });
  it('вертикальные линии тоже', () => {
    const b = fromRows(['wsg', 'whs', 'swg', 'hsx']);
    const r = trySwap(b, { x: 0, y: 2 }, { x: 1, y: 2 })!;
    expect(r.steps[0].cleared.map((c) => c.x)).toEqual([0, 0, 0]);
    expect(r.steps[0].counts.wood).toBe(3);
  });
});

describe('каскады', () => {
  it('упавшие самоцветы дают следующую волну (комбо)', () => {
    // Убираем три меча в строке 2 — два дерева сверху падают на третье в столбце 0.
    const b = fromRows(['wshg', 'wgxs', 'xxgh', 'whsg']);
    const r = trySwap(b, { x: 2, y: 2 }, { x: 2, y: 1 })!;
    expect(r).not.toBeNull();
    expect(r.steps.length).toBeGreaterThanOrEqual(2);
    expect(r.steps[1].combo).toBe(2);
    expect(r.combo).toBe(r.steps.length);
    expect(r.steps[1].counts.wood).toBeGreaterThanOrEqual(3);
  });
  it('после хода доска полная и без готовых совпадений', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let b = createBoard({ seed });
      for (let turn = 0; turn < 15; turn++) {
        const m = hint(b)!;
        expect(m).not.toBeNull();
        const r = trySwap(b, m.a, m.b)!;
        expect(r).not.toBeNull();
        b = r.board;
        expect(gemCount(b)).toBe(64);
        expect(findRuns(b)).toHaveLength(0);
        expect(hasMove(b)).toBe(true);
      }
    }
  });
  it('падения записаны: каждый самоцвет падает вниз', () => {
    const b = fromRows(['wshg', 'wgxs', 'xxgh', 'whsg']);
    const r = trySwap(b, { x: 2, y: 2 }, { x: 2, y: 1 })!;
    for (const f of r.steps[0].falls) expect(f.to).toBeGreaterThan(f.from);
    expect(r.steps[0].spawned.length).toBe(3);
  });
});

describe('особые самоцветы', () => {
  it('4 в строку — луч по столбцу на клетке хода', () => {
    const b = fromRows(['xxsxg', 'hgxwh', 'sghsw', 'ghswg']);
    const r = trySwap(b, { x: 2, y: 1 }, { x: 2, y: 0 })!;
    const made = r.steps[0].created[0];
    expect(made.gem.special).toBe('lineV');
    expect(made).toMatchObject({ x: 2, y: 0 });
    expect(r.steps[0].cleared).toHaveLength(4);
  });
  it('4 в столбец — луч по строке', () => {
    const b = fromRows(['wsg', 'whs', 'swg', 'wsx', 'hgs']);
    const r = trySwap(b, { x: 1, y: 2 }, { x: 0, y: 2 })!;
    expect(r.steps[0].created[0].gem.special).toBe('lineH');
  });
  it('уголок — бомба на пересечении', () => {
    // Уголок: (0,3)…(2,3) и (2,1)…(2,3).
    const c = fromRows(['hwgs', 'gsxh', 'hgxs', 'xxsx', 'hgsg']);
    const r = trySwap(c, { x: 2, y: 3 }, { x: 3, y: 3 })!;
    expect(r).not.toBeNull();
    expect(r.steps[0].created[0].gem.special).toBe('bomb');
    expect(r.steps[0].created[0]).toMatchObject({ x: 2, y: 3 });
  });
  it('5 в ряд — радуга', () => {
    const b = fromRows(['xxsxx', 'hgxwh', 'sghsw', 'ghswg']);
    const r = trySwap(b, { x: 2, y: 1 }, { x: 2, y: 0 })!;
    expect(r.steps[0].created[0].gem.special).toBe('rainbow');
    expect(r.steps[0].longest).toBe(5);
  });
  it('луч, задетый совпадением, бьёт всю строку', () => {
    const b = special(fromRows(['wwsxhg', 'hgwsgx', 'sxhgsh', 'gsgxhs']), 0, 0, 'lineH');
    const r = trySwap(b, { x: 2, y: 0 }, { x: 2, y: 1 })!;
    const first = r.steps[0];
    expect(first.blasts.some((x) => x.kind === 'row' && x.y === 0)).toBe(true);
    expect(first.cleared.filter((c) => c.y === 0)).toHaveLength(6);
  });
  it('бомба бьёт 3×3', () => {
    const b = special(fromRows(['hsgxh', 'gwwsx', 'xhgwg', 'shxhs', 'gxshg']), 1, 1, 'bomb');
    const r = trySwap(b, { x: 3, y: 1 }, { x: 3, y: 2 })!;
    const s = r.steps[0];
    expect(s.blasts.some((x) => x.kind === 'bomb')).toBe(true);
    for (let y = 0; y <= 2; y++) for (let x = 0; x <= 2; x++) expect(s.cleared.some((c) => c.x === x && c.y === y)).toBe(true);
  });
  it('радуга с обычным самоцветом убирает весь его вид', () => {
    const b = special(fromRows(['wsgx', 'hwsg', 'sgwh', 'xhsw']), 0, 0, 'rainbow');
    const r = trySwap(b, { x: 0, y: 0 }, { x: 1, y: 0 })!;
    expect(r.steps[0].blasts[0]).toMatchObject({ kind: 'rainbow', target: 'stone' });
    expect(r.steps[0].counts.stone).toBe(4);
  });
  it('радуга + радуга — вся доска', () => {
    const b = special(special(fromRows(['wsgx', 'hwsg', 'sgwh', 'xhsw']), 0, 0, 'rainbow'), 1, 0, 'rainbow');
    const r = trySwap(b, { x: 0, y: 0 }, { x: 1, y: 0 })!;
    expect(r.steps[0].cleared).toHaveLength(16);
  });
  it('два луча — крест', () => {
    const b = special(special(fromRows(['wsgxh', 'hwsgx', 'sgwhs', 'xhswg', 'gxhsw']), 1, 2, 'lineH'), 2, 2, 'lineV');
    const r = trySwap(b, { x: 1, y: 2 }, { x: 2, y: 2 })!;
    const s = r.steps[0];
    expect(s.cleared.filter((c) => c.y === 2)).toHaveLength(5);
    expect(s.cleared.filter((c) => c.x === 2)).toHaveLength(5);
  });
  it('цепочка: луч задевает бомбу', () => {
    const b = special(special(fromRows(['wwsxh', 'hgwsg', 'sxhgs', 'gsgxh', 'xhsgw']), 0, 0, 'lineV'), 0, 3, 'bomb');
    const r = trySwap(b, { x: 2, y: 0 }, { x: 2, y: 1 })!;
    const kinds = r.steps[0].blasts.map((x) => x.kind);
    expect(kinds).toContain('col');
    expect(kinds).toContain('bomb');
  });
});

describe('препятствия', () => {
  it('совпадение рядом бьёт ящик, валун держит два удара', () => {
    const b = fromRows(['wwsh', '#@wx', 'sghs', 'ghsx']);
    const r = trySwap(b, { x: 2, y: 0 }, { x: 2, y: 1 })!;
    const hits = r.steps[0].blocksHit;
    expect(hits.find((h) => h.kind === 'crate')).toMatchObject({ hp: 0 });
    expect(hits.find((h) => h.kind === 'boulder')).toMatchObject({ hp: 1 });
    expect(r.steps[0].after.cells[idx(b, 0, 1)].block).toBeUndefined();
    expect(r.steps[0].after.cells[idx(b, 1, 1)].block?.hp).toBe(1);
  });
  it('лёд трескается от совпадения на своей клетке', () => {
    const b = fromRows(['wwsh', 'hgwx', 'sghs', 'ghsx']);
    b.cells[idx(b, 0, 0)].ice = 2;
    const r = trySwap(b, { x: 2, y: 0 }, { x: 2, y: 1 })!;
    expect(r.steps[0].iceHit[0]).toMatchObject({ x: 0, y: 0, left: 1 });
    expect(r.board.cells[0].ice).toBe(1);
  });
  it('самоцветы падают сквозь валун', () => {
    const b = fromRows(['hsgw', '@gxs', 'xxgx', 'gshh']);
    const r = trySwap(b, { x: 2, y: 2 }, { x: 2, y: 1 })!;
    expect(r.board.cells[idx(b, 0, 1)].block).toBeDefined();
    expect(gemCount(r.board)).toBe(openCount(r.board));
  });
});

describe('детерминизм и перемешивание', () => {
  it('одни и те же ходы — тот же результат', () => {
    const play = () => {
      let b = createBoard({ seed: 777 });
      const log: string[] = [];
      for (let i = 0; i < 20; i++) {
        const m = hint(b)!;
        const r = trySwap(b, m.a, m.b)!;
        log.push(`${r.combo}:${r.counts.sword}:${r.counts.wood}`);
        b = r.board;
      }
      return [log, toRows(b)];
    };
    expect(play()).toEqual(play());
  });
  it('без ходов доска перемешивается и ход появляется', () => {
    // Виды по диагонали со сдвигом на 2: ни одного хода.
    const b = fromRows(['wsghx', 'ghxws', 'xwsgh', 'sghxw', 'hxwsg'], 9);
    expect(hasMove(b)).toBe(false);
    const c = cloneBoard(b);
    reshuffle(c);
    expect(hasMove(c)).toBe(true);
    expect(findRuns(c)).toHaveLength(0);
  });
  it('ход, после которого ходов нет, перемешивает доску', () => {
    let seen = false;
    for (let seed = 1; seed <= 300 && !seen; seed++) {
      let b = createBoard({ seed, w: 5, h: 5, kinds: ['wood', 'stone', 'gold', 'heart', 'sword'] });
      for (let i = 0; i < 30 && !seen; i++) {
        const m = hint(b)!;
        const r = trySwap(b, m.a, m.b)!;
        if (r.reshuffled) seen = true;
        expect(hasMove(r.board)).toBe(true);
        b = r.board;
      }
    }
    expect(seen).toBe(true);
  });
  it('подсказка — настоящий ход', () => {
    const b = createBoard({ seed: 3 });
    const m = hint(b)!;
    expect(findMoves(b).length).toBeGreaterThan(0);
    expect(trySwap(b, m.a, m.b)).not.toBeNull();
    expect(gemAt(b, m.a.x, m.a.y)).not.toBeNull();
  });
});
