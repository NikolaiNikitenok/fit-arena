import { describe, expect, it } from 'vitest';
import { Store } from './store';

describe('Store', () => {
  it('победа и поражение меняют кубки, рейтинг по кубкам', () => {
    const s = new Store(null, () => Date.UTC(2026, 9, 20));
    const a = s.get('a', 'Аня');
    const b = s.get('b', 'Боря');
    s.result(a, b, 'a');
    expect(a.cups).toBe(30);
    expect(b.cups).toBe(0);
    s.result(a, b, 'a');
    expect(s.top(10).map((p) => p.id)).toEqual(['a', 'b']);
    expect(s.rank('a')).toBe(1);
  });

  it('новый сезон сжимает кубки', () => {
    let t = Date.UTC(2026, 9, 20);
    const s = new Store(null, () => t);
    const a = s.get('a', 'Аня');
    a.cups = 800;
    t = Date.UTC(2026, 10, 20);
    expect(s.get('a', 'Аня').cups).toBe(400);
  });
});
