import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ busy: false, sync: vi.fn() }));
vi.mock('react', () => ({ useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() }));
vi.mock('../cloud', () => ({ syncNow: h.sync }));
vi.mock('../game/progress', () => ({ hasHero: () => true, loadProgress: () => ({}) }));
vi.mock('../telemetry', () => ({ APP_VERSION: 'test-current' }));
vi.mock('./busy', () => ({ isBusy: () => h.busy }));

const storage = () => {
  const values = new Map<string, string>();
  return { getItem: vi.fn((k: string) => values.get(k) ?? null), setItem: vi.fn((k: string, v: string) => values.set(k, v)) };
};
const entry = (n: number) => ({ n, date: '2026-11-05', title: 'Concrete release', items: ['Fixed camera readiness'] });

describe('updates: defer, safe reload, release details', () => {
  let updates: typeof import('./updates');
  let replace: ReturnType<typeof vi.fn>;
  let fetchVersion: ReturnType<typeof vi.fn>;
  let appWindow: EventTarget;
  beforeEach(async () => {
    vi.resetModules(); vi.useFakeTimers(); h.busy = false; h.sync.mockReset().mockResolvedValue(undefined);
    replace = vi.fn(); fetchVersion = vi.fn(); appWindow = new EventTarget();
    vi.stubGlobal('fetch', fetchVersion);
    vi.stubGlobal('window', appWindow);
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
    vi.stubGlobal('location', { pathname: '/arena', search: '?foo=1', hash: '#home', replace });
    vi.stubGlobal('sessionStorage', storage()); vi.stubGlobal('localStorage', storage());
    updates = await import('./updates');
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const release = async (version: string, changelog = [entry(999)]) => {
    fetchVersion.mockResolvedValue({ ok: true, json: async () => ({ version, changelog }) });
    await updates.checkUpdate();
  };

  it('после перезапуска хранится только в JS-процессе, не исчезает на 10 минут или бой', async () => {
    await release('next-build');
    expect(updates.useRemoteUpdate()?.version).toBe('next-build');
    updates.deferUpdate('next-build');
    expect(updates.useRemoteUpdate()).toBeNull();
    h.busy = true; await vi.advanceTimersByTimeAsync(11 * 60000); h.busy = false;
    await release('next-build');
    expect(updates.useRemoteUpdate()).toBeNull();
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
    vi.resetModules(); updates = await import('./updates'); await release('next-build');
    expect(updates.useRemoteUpdate()?.version).toBe('next-build');
  });

  it('отложенная версия не скрывает другое новое обновление', async () => {
    await release('next-build'); updates.deferUpdate('next-build');
    await release('newer-build');
    expect(updates.useRemoteUpdate()?.version).toBe('newer-build');
  });

  it('version.json текущей версии очищает устаревшее remote предложение', async () => {
    await release('next-build'); await release('test-current');
    expect(updates.useRemoteUpdate()).toBeNull();
  });

  it('при одинаковом номере истории показывает конкретную последнюю запись', async () => {
    const { LATEST_CHANGE } = await import('./changelog');
    const r = { version: 'next-build', changelog: [entry(LATEST_CHANGE), entry(LATEST_CHANGE - 1)] };
    expect(updates.newEntries(r)).toEqual([r.changelog[0]]);
  });

  it('не обновляет занятую тренировку', async () => {
    h.busy = true;
    await updates.applyUpdate('next-build');
    expect(h.sync).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
  });

  it('повторно проверяет busy после sync, разрешая поздний безопасный повтор', async () => {
    let finish!: () => void;
    h.sync.mockImplementationOnce(() => new Promise<void>((r) => { finish = r; }));
    const applying = updates.applyUpdate('next-build');
    expect(h.sync).toHaveBeenCalledOnce();
    h.busy = true; finish(); await applying;
    expect(replace).not.toHaveBeenCalled();
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
    h.busy = false; await updates.applyUpdate('next-build');
    expect(replace).toHaveBeenCalledOnce();
    expect(replace.mock.calls[0][0]).toContain('v=next-build');
  });

  it('preloadError во время боя проверяет обновление без автообновления сейчас или после боя', async () => {
    await release('next-build'); h.busy = true;
    updates.initUpdates(); appWindow.dispatchEvent(new Event('vite:preloadError'));
    await vi.advanceTimersByTimeAsync(4000);
    expect(replace).not.toHaveBeenCalled(); expect(h.sync).not.toHaveBeenCalled();
    h.busy = false; await vi.advanceTimersByTimeAsync(11000);
    expect(replace).not.toHaveBeenCalled();
  });

  it('preloadError уважает выбор После перезапуска и проверяет версию без перенаправления', async () => {
    await release('next-build'); updates.deferUpdate('next-build');
    fetchVersion.mockClear();
    updates.initUpdates(); appWindow.dispatchEvent(new Event('vite:preloadError'));
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchVersion).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled(); expect(h.sync).not.toHaveBeenCalled();
    expect(updates.useRemoteUpdate()).toBeNull();
  });

});
