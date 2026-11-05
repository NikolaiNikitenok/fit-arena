import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  slots: [] as any[], cursor: 0, effects: [] as (() => unknown)[],
  rep: null as null | (() => void), error: null as null | (() => void), start: vi.fn(),
}));
vi.mock('react', () => ({
  useRef: (initial: unknown) => h.slots[h.cursor++] ??= { current: initial },
  useState: (initial: unknown) => {
    const i = h.cursor++;
    h.slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [h.slots[i].value, (value: unknown) => { h.slots[i].value = value; }];
  },
  useEffect: (effect: () => unknown) => { h.effects.push(effect); },
}));
vi.mock('../useRepCamera', () => ({
  POSITIONING_ENABLED: true,
  useRepCamera: () => ({ start: h.start, switchExercise: vi.fn(), stop: vi.fn(), calib: null, waiting: false, preparing: false, hint: null }),
}));
vi.mock('../telemetry', () => ({ track: vi.fn() }));
vi.mock('../voice', () => ({ say: vi.fn(), unlockVoice: vi.fn(), useVoiceCoach: vi.fn() }));
vi.mock('../settings', () => ({ useSettings: () => ({ guide: false }) }));
vi.mock('../calibration', () => ({ needsCalibration: () => false }));
vi.mock('../audio', () => ({ sfx: vi.fn() }));
vi.mock('../CameraGuide', () => ({ CameraGuide: () => null }));
vi.mock('../CalibrationOverlay', () => ({ CalibrationOverlay: () => null }));
vi.mock('../StartGate', () => ({ StartGate: () => null }));
vi.mock('../warmup/warmup', () => ({ withWarmup: (go: () => void) => go() }));
import { WorkoutSession } from './WorkoutSession';

function findButton(node: any): any {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'button' && node.props.className === 'primary') return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) {
    const found = findButton(child); if (found) return found;
  }
  return null;
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('WorkoutSession retry callbacks (mock React scheduler/camera)', () => {
  it('после camera runtime error заново считает подход, не начисляя прежние done повторно', async () => {
    vi.useFakeTimers(); vi.stubGlobal('window', {});
    h.slots.length = 0; h.cursor = 0; h.effects.length = 0;
    h.start.mockReset().mockImplementation(async (_exercise, onRep, _frame, opts) => { h.rep = onRep; h.error = opts.onError; });
    const props = {
      tag: 'test', title: 'test', model: 'knight' as any,
      sets: [{ exercise: 'squat' as const, target: 2, rest: 5 }, { exercise: 'squat' as const, target: 2, rest: 5 }],
      onSet: vi.fn(), onFinish: vi.fn(), onExit: vi.fn(),
    };
    const render = () => { h.cursor = 0; h.effects.length = 0; return WorkoutSession(props); };
    findButton(render()).props.onClick();
    await Promise.resolve(); await Promise.resolve();
    expect(h.start).toHaveBeenLastCalledWith('squat', expect.any(Function), undefined, expect.objectContaining({ autoGo: true, calibrate: false, gate: true, prepare: true }));
    render();
    const cleanupFirst = h.effects[1]() as () => void;
    vi.advanceTimersByTime(5200);
    h.rep!(); h.rep!();
    expect(props.onSet.mock.calls.map((call) => call[1])).toEqual([2]);
    h.error!(); cleanupFirst();
    findButton(render()).props.onClick();
    await Promise.resolve(); await Promise.resolve();
    render();
    const cleanupRetry = h.effects[1]() as () => void;
    vi.advanceTimersByTime(5200);
    h.rep!();
    expect(props.onSet).toHaveBeenCalledTimes(1);
    h.rep!();
    expect(props.onSet.mock.calls.map((call) => call[1])).toEqual([2, 2]);
    expect(props.onFinish).not.toHaveBeenCalled();
    cleanupRetry();
  });
});
