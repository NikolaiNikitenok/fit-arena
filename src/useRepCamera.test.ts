import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Landmark } from './repCounter';

const h = vi.hoisted(() => ({
  refs: [] as { current: any }[], effects: [] as (() => unknown)[], cursor: 0, events: [] as { n: string; m: unknown }[],
  create: vi.fn(), getMedia: vi.fn(), detect: vi.fn(),
}));
vi.mock('react', () => ({
  useRef: (current: unknown) => h.refs[h.cursor++] ??= { current },
  useState: (value: unknown) => [value, vi.fn()],
  useEffect: (effect: () => void) => { h.effects.push(effect); },
}));
vi.mock('./pose', () => ({ createPoseLandmarker: h.create, loadVision: async () => ({ DrawingUtils: class {}, PoseLandmarker: {} }) }));
vi.mock('./updates/busy', () => ({ useBusy: vi.fn() }));
vi.mock('./orientation', () => ({ enableOrientation: vi.fn(), frameRotations: () => [0] }));
vi.mock('./settings', () => ({ getSettings: () => ({ skeleton: false, haptics: false, lowPower: false }) }));
vi.mock('./calibration', () => ({ personalThresholds: () => undefined }));
vi.mock('./voice', () => ({ say: vi.fn() }));
vi.mock('./audio', () => ({ repSound: vi.fn() }));
vi.mock('./telegram', () => ({ hapticRep: vi.fn() }));
vi.mock('./telemetry', async () => {
  const { trainingReporter } = await import('../shared/trainingTelemetry');
  return { reportCameraFailure: vi.fn(), trackOnce: vi.fn(), createTrainingTelemetry: () => trainingReporter((n, m) => h.events.push({ n, m })) };
});
vi.mock('./flames', () => ({ Flames: class { step() {} } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function squat(): Landmark[] {
  const lm = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: .9 }));
  for (const [i, y] of [[11, .15], [23, .35], [25, .55], [27, .85]]) {
    lm[i].y = lm[i + 1].y = y;
  }
  return lm;
}

describe('useRepCamera async lifecycle (mock browser, real counters/FSM)', () => {
  let clock = 0;
  let frames: Map<number, FrameRequestCallback>;
  let next: number;
  let track: { stop: ReturnType<typeof vi.fn> };
  let video: { srcObject: unknown; play: ReturnType<typeof vi.fn>; readyState: number; currentTime: number; videoWidth: number; videoHeight: number };
  let useRepCamera: typeof import('./useRepCamera').useRepCamera;
  const tick = (at: number) => {
    clock = at;
    video.currentTime = at / 1000;
    const pending = [...frames.values()]; frames.clear();
    pending.forEach((callback) => callback(at));
  };
  beforeEach(async () => {
    vi.resetModules();
    h.refs.length = 0; h.effects.length = 0; h.cursor = 0; h.events.length = 0;
    h.create.mockReset(); h.getMedia.mockReset(); h.detect.mockReset();
    frames = new Map(); next = 0; clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++next, callback); return next; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: h.getMedia } });
    track = { stop: vi.fn() };
    h.getMedia.mockResolvedValue({ getTracks: () => [track] });
    h.detect.mockReturnValue({ landmarks: [squat()] });
    h.create.mockResolvedValue({ detectForVideo: h.detect });
    video = { srcObject: null, play: vi.fn().mockResolvedValue(undefined), readyState: 2, currentTime: 0, videoWidth: 640, videoHeight: 640 };
    ({ useRepCamera } = await import('./useRepCamera'));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const mount = () => {
    const camera = useRepCamera(false);
    camera.videoRef.current = video as unknown as HTMLVideoElement;
    camera.canvasRef.current = { width: 640, height: 640, getContext: () => ({ clearRect: vi.fn(), strokeRect: vi.fn() }) } as unknown as HTMLCanvasElement;
    return camera;
  };

  it('отмена загрузки модели не открывает камеру позднее', async () => {
    const model = deferred<any>(); h.create.mockReturnValue(model.promise);
    const camera = mount();
    const start = camera.start('squat', vi.fn());
    camera.stop();
    model.resolve({ detectForVideo: h.detect });
    await expect(start).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.getMedia).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('позднее разрешение камеры после отмены освобождает все дорожки', async () => {
    const media = deferred<any>(); h.getMedia.mockReturnValue(media.promise);
    const camera = mount();
    const start = camera.start('squat', vi.fn());
    await vi.waitFor(() => expect(h.getMedia).toHaveBeenCalledOnce());
    camera.stop();
    media.resolve({ getTracks: () => [track] });
    await expect(start).rejects.toMatchObject({ name: 'AbortError' });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.play).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('не допускает двух параллельных запусков', async () => {
    const camera = mount();
    const start = camera.start('squat', vi.fn());
    await expect(camera.start('squat', vi.fn())).rejects.toThrow('Камера уже запущена');
    await start;
    expect(h.getMedia).toHaveBeenCalledOnce();
    camera.stop();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(frames.size).toBe(0);
  });

  it('positioning/countdown не расходуют время потребителя и не начисляют повторов', async () => {
    h.detect.mockReturnValue({ landmarks: [] });
    const camera = mount(); const onFrame = vi.fn(() => true); const onRep = vi.fn();
    await camera.start('squat', onRep, onFrame, { prepare: true });
    for (let at = 100; at <= 5000; at += 100) tick(at);
    expect(onFrame).not.toHaveBeenCalled(); expect(onRep).not.toHaveBeenCalled();
    h.detect.mockReturnValue({ landmarks: [squat()] });
    for (let at = 5100; at <= 9600; at += 100) tick(at);
    expect(onFrame).not.toHaveBeenCalled(); expect(onRep).not.toHaveBeenCalled();
    tick(9700);
    expect(onFrame).toHaveBeenCalledOnce();
    camera.stop();
  });

  it('после ACTIVE потеря человека не останавливает дедлайн и освобождение камеры', async () => {
    const camera = mount(); let calls = 0;
    const onFrame = vi.fn(() => ++calls < 4);
    await camera.start('squat', vi.fn(), onFrame, { prepare: true });
    for (let at = 100; at <= 4500; at += 100) tick(at);
    expect(onFrame).not.toHaveBeenCalled();
    h.detect.mockReturnValue({ landmarks: [] });
    for (let at = 4600; at <= 5000; at += 100) tick(at);
    expect(onFrame).toHaveBeenCalledTimes(4);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });

  it('ошибка воспроизведения освобождает полученную камеру', async () => {
    video.play.mockRejectedValue(new Error('play failed'));
    const camera = mount();
    await expect(camera.start('squat', vi.fn())).rejects.toThrow('play failed');
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(frames.size).toBe(0);
  });

  it('ошибка распознавания останавливает камеру и сообщает потребителю', async () => {
    const camera = mount(); const onError = vi.fn();
    await camera.start('squat', vi.fn(), undefined, { prepare: true, onError });
    h.detect.mockImplementation(() => { throw new Error('inference failed'); });
    tick(100);
    expect(onError).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });

  it('позднее завершение старого getUserMedia не останавливает новый запуск', async () => {
    const oldMedia = deferred<any>(); h.getMedia.mockReturnValueOnce(oldMedia.promise);
    const camera = mount();
    const oldStart = camera.start('squat', vi.fn());
    await vi.waitFor(() => expect(h.getMedia).toHaveBeenCalledOnce());
    camera.stop();
    await camera.start('squat', vi.fn());
    const oldTrack = { stop: vi.fn() };
    oldMedia.resolve({ getTracks: () => [oldTrack] });
    await expect(oldStart).rejects.toMatchObject({ name: 'AbortError' });
    expect(oldTrack.stop).toHaveBeenCalledOnce();
    expect(track.stop).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    camera.stop();
  });


  it('ошибка первого кадра отклоняет start, не позволяя экрану перезаписать ERROR на running', async () => {
    h.detect.mockImplementation(() => { throw new Error('first inference failed'); });
    const camera = mount(); const onError = vi.fn();
    await expect(camera.start('squat', vi.fn(), undefined, { prepare: true, onError })).rejects.toThrow('first inference failed');
    expect(track.stop).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });


  it('повторный вызов hook с сохранёнными refs позволяет остановить прежний RAF', async () => {
    const camera = mount();
    await camera.start('squat', vi.fn());
    h.cursor = 0;
    const rerendered = useRepCamera(false);
    expect(rerendered.videoRef).toBe(camera.videoRef);
    await expect(rerendered.start('squat', vi.fn())).rejects.toThrow('Камера уже запущена');
    rerendered.stop();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });

  it('cleanup эффекта при unmount отменяет незавершённый запуск', async () => {
    const media = deferred<any>(); h.getMedia.mockReturnValue(media.promise);
    const camera = mount();
    const cleanup = h.effects[0]() as () => void;
    const start = camera.start('squat', vi.fn());
    await vi.waitFor(() => expect(h.getMedia).toHaveBeenCalledOnce());
    cleanup();
    media.resolve({ getTracks: () => [track] });
    await expect(start).rejects.toMatchObject({ name: 'AbortError' });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });


  it('go отказывает до готовности, по устаревшему наблюдению и при повторном нажатии', async () => {
    const camera = mount();
    expect(camera.go()).toBeFalsy();
    await camera.start('squat', vi.fn(), undefined, { gate: true, prepare: true });
    expect(camera.go()).toBeFalsy();
    for (let at = 100; at <= 1500; at += 100) tick(at);
    clock = 2501;
    expect(camera.go()).toBeFalsy();
    for (let at = 2600; at <= 4200; at += 100) tick(at);
    expect(camera.go()).toBe(true);
    expect(camera.go()).toBeFalsy();
    camera.stop();
  });

  it('события managed подготовки и завершения не дублируются после stop и cleanup', async () => {
    const camera = mount();
    await camera.start('squat', vi.fn(), () => clock < 5000, { prepare: true });
    for (let at = 100; at <= 5200; at += 100) tick(at);
    camera.stop(); camera.stop();
    const names = h.events.map((e) => e.n);
    for (const event of ['camera_permission_requested', 'camera_permission_granted', 'camera_ready', 'positioning_started', 'positioning_completed', 'countdown_started', 'exercise_started', 'exercise_completed']) {
      expect(names.filter((n) => n === event), event).toHaveLength(1);
    }
    expect(names).not.toContain('exercise_abandoned');
    expect(names.indexOf('exercise_started')).toBeGreaterThan(names.indexOf('countdown_started'));
  });

  it('tracking_lost записывается на переходе, а не на каждом кадре', async () => {
    const camera = mount();
    await camera.start('squat', vi.fn(), undefined, { prepare: true });
    for (let at = 100; at <= 4500; at += 100) tick(at);
    h.detect.mockReturnValue({ landmarks: [] });
    for (let at = 4600; at <= 5500; at += 100) tick(at);
    expect(h.events.filter((e) => e.n === 'tracking_lost')).toHaveLength(1);
    h.detect.mockReturnValue({ landmarks: [squat()] }); tick(5600);
    h.detect.mockReturnValue({ landmarks: [] }); tick(5700);
    expect(h.events.filter((e) => e.n === 'tracking_lost')).toHaveLength(2);
    camera.stop(); camera.stop();
    expect(h.events.filter((e) => e.n === 'exercise_abandoned')).toHaveLength(1);
  });


  it('старый unmanaged путь не загрязняет новую воронку событий', async () => {
    const camera = mount();
    await camera.start('squat', vi.fn(), () => clock < 1000);
    for (let at = 100; at <= 1200; at += 100) tick(at);
    camera.stop();
    expect(h.events).toEqual([]);
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('stop COMPLETED до ACTIVE не записывает успешное завершение упражнения', async () => {
    const camera = mount();
    await camera.start('squat', vi.fn(), undefined, { prepare: true });
    for (let at = 100; at <= 2000; at += 100) tick(at);
    camera.stop('COMPLETED'); camera.stop();
    expect(h.events.filter((e) => e.n === 'exercise_started')).toHaveLength(0);
    expect(h.events.filter((e) => e.n === 'exercise_completed')).toHaveLength(0);
    expect(h.events.filter((e) => e.n === 'exercise_abandoned')).toHaveLength(1);
    expect(track.stop).toHaveBeenCalledOnce();
  });


  for (const stage of ['media', 'play'] as const) {
    it(`поздний reject старого ${stage} не даёт caller catch остановить новую камеру`, async () => {
      const pending = deferred<any>();
      const oldTrack = { stop: vi.fn() };
      if (stage === 'media') h.getMedia.mockReturnValueOnce(pending.promise);
      else {
        h.getMedia.mockResolvedValueOnce({ getTracks: () => [oldTrack] });
        video.play.mockReturnValueOnce(pending.promise);
      }
      const camera = mount();
      // Повторяет ветку catch реальных экранов: обычная ошибка останавливает камеру.
      const oldStart = camera.start('squat', vi.fn()).catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) camera.stop();
        return e;
      });
      await vi.waitFor(() => expect(stage === 'media' ? h.getMedia : video.play).toHaveBeenCalledOnce());
      camera.stop();
      await camera.start('squat', vi.fn());
      pending.reject(new Error('late rejected old attempt'));
      await expect(oldStart).resolves.toMatchObject({ name: 'AbortError' });
      expect(track.stop).not.toHaveBeenCalled();
      expect(frames.size).toBe(1);
      camera.stop();
    });
  }


  it('флаг отката отключает подготовку, readiness gate и новую телеметрию', async () => {
    vi.stubEnv('VITE_POSITIONING_GATE', '0');
    vi.resetModules();
    ({ useRepCamera } = await import('./useRepCamera'));
    h.detect.mockReturnValue({ landmarks: [] });
    const camera = mount();
    const onFrame = vi.fn(() => true);
    await camera.start('squat', vi.fn(), onFrame, { prepare: true });
    expect(onFrame).toHaveBeenCalledOnce();
    expect(h.events).toEqual([]);
    camera.stop();
    onFrame.mockClear();
    await camera.start('squat', vi.fn(), onFrame, { prepare: true, gate: true });
    expect(onFrame).not.toHaveBeenCalled();
    expect(camera.go()).toBe(true);
    tick(100);
    expect(onFrame).toHaveBeenCalledOnce();
    camera.stop();
    expect(h.events).toEqual([]);
  });


  it('реальный pushup readiness с шумом включает go и ACTIVE, не начисляя подготовительные движения', async () => {
    const pushup = (theta: number) => {
      const lm = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: .9 }));
      const radians = theta * Math.PI / 180;
      for (const [i, x, y] of [[11, .3, .6], [13, .3, .7], [15, .3 - .1 * Math.sin(radians), .7 - .1 * Math.cos(radians)], [23, .55, .6], [25, .7, .605], [27, .85, .61]]) {
        lm[i] = { x, y, visibility: .9 }; lm[i + 1] = { x, y, visibility: .9 };
      }
      // Одиночный плохой кадр таза раз в секунду; человек остаётся обнаруженным.
      if (clock % 1000 === 900) lm[23].visibility = lm[24].visibility = .1;
      return lm;
    };
    h.detect.mockImplementation(() => ({ landmarks: [pushup(Math.floor(clock / 400) % 2 ? 70 : 170)] }));
    const camera = mount(); const onFrame = vi.fn(() => true); const onRep = vi.fn();
    await camera.start('pushup', onRep, onFrame, { gate: true, prepare: true });
    for (let at = 100; at <= 1900; at += 100) tick(at);
    expect(camera.go()).toBeFalsy(); // На плохом кадре кнопка остаётся закрытой.
    tick(2000);
    expect(camera.go()).toBe(true);
    for (let at = 2100; at <= 6000; at += 100) tick(at);
    expect(onFrame).not.toHaveBeenCalled();
    expect(onRep).not.toHaveBeenCalled();
    for (let at = 6100; at <= 8500; at += 100) tick(at);
    expect(onFrame).toHaveBeenCalled();
    expect(h.events.filter((e) => e.n === 'exercise_started')).toHaveLength(1);
    camera.stop();
  });

  it('не разрешает pushup go, если человек отсутствует всё время подготовки', async () => {
    h.detect.mockReturnValue({ landmarks: [] });
    const camera = mount(); const onFrame = vi.fn(() => true); const onRep = vi.fn();
    await camera.start('pushup', onRep, onFrame, { gate: true, prepare: true });
    for (let at = 100; at <= 10000; at += 100) { tick(at); expect(camera.go()).toBeFalsy(); }
    expect(onFrame).not.toHaveBeenCalled();
    expect(onRep).not.toHaveBeenCalled();
    camera.stop();
  });

});
