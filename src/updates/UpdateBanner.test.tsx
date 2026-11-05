import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  slots: [] as any[], cursor: 0, effects: [] as (() => unknown)[], busy: false,
  remote: null as any, fresh: [] as any[], defer: vi.fn(), apply: vi.fn(), seen: vi.fn(),
}));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = h.cursor++;
    h.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [h.slots[index].value, (value: unknown) => { h.slots[index].value = value; }];
  },
  useEffect: (effect: () => unknown) => { h.effects.push(effect); },
}));
vi.mock('../telemetry', () => ({ APP_VERSION: 'test-version' }));
vi.mock('../audio', () => ({ sfx: vi.fn() }));
vi.mock('./busy', () => ({ useIsBusy: () => h.busy }));
vi.mock('./updates', () => ({
  useRemoteUpdate: () => h.remote,
  deferUpdate: h.defer, applyUpdate: h.apply, markSeen: h.seen,
  initUpdates: vi.fn(), setBannerOpen: vi.fn(),
  newEntries: (remote: any) => remote.changelog,
  unseenEntries: () => h.fresh,
}));
import { ChangesList, UpdateBanner } from './UpdateBanner';
const change = { n: 999, date: '2026-11-05', title: 'Исправлен запуск камеры', items: ['Упражнение начинается после готовности позы'] };
const nodes = (node: any): any[] => {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  return [node, ...(Array.isArray(children) ? children.flat(Infinity) : [children]).flatMap(nodes)];
};
const textOf = (node: any): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  const children = node.props?.children;
  return (Array.isArray(children) ? children.flat(Infinity) : [children]).map(textOf).join(' ');
};
const render = () => { h.cursor = 0; h.effects.length = 0; return UpdateBanner(); };
const effects = () => h.effects.forEach((run) => run());

beforeEach(() => {
  vi.useFakeTimers(); h.slots.length = 0; h.cursor = 0; h.effects.length = 0;
  h.busy = false; h.remote = { version: 'next-build', changelog: [change] }; h.fresh = [];
  h.defer.mockReset(); h.apply.mockReset().mockResolvedValue(false); h.seen.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('UpdateBanner callbacks (mock React scheduler)', () => {
  it('показывает конкретные изменения и обе явные кнопки', () => {
    const ui = render();
    const text = textOf(ui);
    expect(text).toContain(change.title); expect(text).toContain(change.items[0]);
    expect(text).toContain('Обновить сейчас'); expect(text).toContain('После перезапуска');
  });

  it('отложенная удалённая версия не помечается прочитанной до загрузки', async () => {
    const ui = render(); effects();
    expect(h.seen).not.toHaveBeenCalled();
    const later = nodes(ui).find((n) => n.type === 'button' && textOf(n).includes('После перезапуска'));
    expect(later).toBeDefined(); later.props.onClick();
    await vi.advanceTimersByTimeAsync(300);
    expect(h.defer).toHaveBeenCalledWith('next-build');
    expect(h.seen).not.toHaveBeenCalled(); expect(h.apply).not.toHaveBeenCalled();
  });

  it('обновить сейчас вызывает сохранение и обновление выбранной версии', () => {
    const ui = render(); effects();
    const now = nodes(ui).find((n) => n.type === 'button' && textOf(n).includes('Обновить сейчас'));
    now.props.onClick();
    expect(h.apply).toHaveBeenCalledWith('next-build');
    expect(h.seen).not.toHaveBeenCalled();
  });

  it('показывает fresh после загрузки и только тогда помечает запись прочитанной', async () => {
    h.remote = null; h.fresh = [change];
    expect(render()).toBeNull(); effects();
    await vi.advanceTimersByTimeAsync(1800);
    const ui = render(); effects();
    expect(textOf(ui)).toContain('Игра обновилась');
    expect(h.seen).toHaveBeenCalledWith(999);
  });

  it('во время тренировки скрывает обновление и не помечает remote прочитанным', () => {
    h.busy = true;
    expect(render()).toBeNull(); effects();
    expect(h.seen).not.toHaveBeenCalled(); expect(h.apply).not.toHaveBeenCalled();
  });

  it('история содержит дату, название и конкретные пункты изменения', () => {
    const text = textOf(ChangesList({ entries: [change] }));
    expect(text).toContain('2026'); expect(text).toContain(change.title); expect(text).toContain(change.items[0]);
  });

  it('возвращает доступную кнопку, если applyUpdate завершился без перезагрузки', async () => {
    let finish!: (started: boolean) => void;
    h.apply.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const ui = render();
    nodes(ui).find((n) => n.type === 'button' && textOf(n).includes('Обновить сейчас')).props.onClick();
    const pending = nodes(render()).find((n) => n.type === 'button' && n.props.className === 'upd-go');
    expect(pending.props.disabled).toBe(true);
    finish(false); await Promise.resolve(); await Promise.resolve();
    const available = nodes(render()).find((n) => n.type === 'button' && n.props.className === 'upd-go');
    expect(available.props.disabled).toBe(false);
    expect(textOf(available)).toContain('Обновить сейчас');
  });

});
