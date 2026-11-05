/** Privacy-limited camera lifecycle protocol. No free-form properties or pose data. */
export const TRAINING_EVENTS = ['camera_permission_requested', 'camera_permission_granted', 'camera_permission_denied', 'camera_ready', 'positioning_started', 'positioning_completed', 'countdown_started', 'exercise_started', 'exercise_completed', 'exercise_abandoned', 'tracking_lost', 'recognition_error', 'first_rep_detected'] as const;
export type TrainingEvent = typeof TRAINING_EVENTS[number];
export const TELEMETRY_EVENT_BATCH = 50;
export const TRAINING_STAGES = ['loading', 'positioning', 'countdown', 'active', 'tracking_lost', 'completed', 'cancelled', 'error'] as const;
export const TRAINING_REASONS = ['permission_denied', 'model', 'camera', 'inference', 'cancelled', 'completed', 'unknown'] as const;
export interface TrainingMetadata {
  exercise?: 'pushup' | 'squat' | 'situp' | 'plank';
  cameraMs?: number;
  failedAttempts?: number;
  exitStage?: typeof TRAINING_STAGES[number];
  reason?: typeof TRAINING_REASONS[number];
}
export interface TrainingEnvelope {
  n: TrainingEvent;
  sid: string;
  at: number;
  v: string;
  id: string;
  m: TrainingMetadata;
}
export function trainingMetadata(raw: unknown): TrainingMetadata {
  const x = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const out: TrainingMetadata = {};
  if (['pushup', 'squat', 'situp', 'plank'].includes(String(x.exercise))) out.exercise = x.exercise as TrainingMetadata['exercise'];
  if (typeof x.cameraMs === 'number' && Number.isFinite(x.cameraMs) && x.cameraMs >= 0) out.cameraMs = Math.min(600_000, Math.round(x.cameraMs));
  if (typeof x.failedAttempts === 'number' && Number.isInteger(x.failedAttempts) && x.failedAttempts >= 0) out.failedAttempts = Math.min(1000, x.failedAttempts);
  if ((TRAINING_STAGES as readonly unknown[]).includes(x.exitStage)) out.exitStage = x.exitStage as TrainingMetadata['exitStage'];
  if ((TRAINING_REASONS as readonly unknown[]).includes(x.reason)) out.reason = x.reason as TrainingMetadata['reason'];
  return out;
}
export function readTrainingEnvelope(raw: unknown, now: number): TrainingEnvelope | null {
  if (!raw || typeof raw !== 'object') return null;
  const x = raw as Record<string, unknown>;
  if (!(TRAINING_EVENTS as readonly unknown[]).includes(x.n)) return null;
  if (typeof x.sid !== 'string' || !/^[a-zA-Z0-9_-]{8,64}$/.test(x.sid)) return null;
  if (typeof x.id !== 'string' || !/^[a-zA-Z0-9_-]{1,96}$/.test(x.id)) return null;
  if (typeof x.at !== 'number' || !Number.isSafeInteger(x.at) || x.at < now - 86_400_000 || x.at > now + 300_000) return null;
  if (typeof x.v !== 'string' || !/^[a-zA-Z0-9._-]{1,40}$/.test(x.v)) return null;
  return { n: x.n as TrainingEvent, sid: x.sid, id: x.id, at: x.at, v: x.v, m: trainingMetadata(x.m) };
}
/** Idempotency is per reporter/attempt. Tracking/error episodes are emitted by transitions. */
export function trainingReporter(push: (n: TrainingEvent, m: TrainingMetadata) => void) {
  const seen = new Set<TrainingEvent>();
  return (n: TrainingEvent, m: TrainingMetadata = {}): void => {
    if (!(TRAINING_EVENTS as readonly unknown[]).includes(n)) return;
    if (seen.has(n) && n !== 'tracking_lost' && n !== 'recognition_error') return;
    seen.add(n);
    push(n, trainingMetadata(m));
  };
}
