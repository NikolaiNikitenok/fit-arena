import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../shared/anon', () => ({ anonId: async () => 'a'.repeat(32) }));
vi.mock('./settings', () => ({ getSettings: () => ({ lowPower: false }) }));
vi.mock('./telegram', () => ({ appSource: () => null, guestId: () => 'guest', tg: undefined }));

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
function browser() {
  vi.stubGlobal('navigator', { userAgent: 'test', sendBeacon: vi.fn(() => false) });
  vi.stubGlobal('screen', { width: 390, height: 844 });
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('location', { pathname: '/', search: '' });
  const fetchMock = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('client lifecycle telemetry', () => {
  it('splits 100 queued events into two accepted server batches without dropping 51–100', async () => {
    const fetchMock = browser();
    const { track, flush, APP_VERSION } = await import('./telemetry');
    for (let i = 0; i < 100; i++) track('app_open');
    await flush(); await flush();
    const batches = fetchMock.mock.calls.map((args) => JSON.parse((args as unknown as [string, { body: string }])[1].body));
    expect(batches.map((x) => x.events.length)).toEqual([50, 50]);
    expect(new Set(batches.flatMap((x) => x.events.map((e: { id: string }) => e.id))).size).toBe(100);
    expect(batches[0].events[0]).toMatchObject({ v: APP_VERSION, id: '1' });
    expect(batches[0].events[0].sid).toBe(batches[1].events[0].sid);
    expect(Number.isSafeInteger(batches[0].events[0].at)).toBe(true);
  });
  it('sanitizes runtime metadata and only emits milestones once per reporter', async () => {
    const fetchMock = browser();
    const { createTrainingTelemetry, flush } = await import('./telemetry');
    const report = createTrainingTelemetry();
    report('camera_ready', { cameraMs: 1500, landmarks: 'private' } as never);
    report('camera_ready');
    await flush();
    const batch = JSON.parse((fetchMock.mock.calls as unknown as [string, { body: string }][])[0][1].body);
    expect(batch.events).toHaveLength(1);
    expect(batch.events[0].m).toEqual({ cameraMs: 1500 });
    expect(JSON.stringify(batch)).not.toContain('private');
  });
});
