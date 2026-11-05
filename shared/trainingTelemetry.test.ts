import { describe, expect, it } from 'vitest';
import { readTrainingEnvelope, trainingMetadata, trainingReporter } from './trainingTelemetry';

describe('training telemetry privacy protocol', () => {
  const now = 1_800_000_000_000;
  const sample = { n: 'camera_ready', sid: 'opaque_session_123', id: '1', at: now, v: 'abc-2026', m: { exercise: 'squat', cameraMs: 1234 } };
  it('keeps only approved properties and bounded finite values', () => {
    expect(trainingMetadata({ ...sample.m, video: 'SECRET', landmarks: [{ x: .1 }], cameraMs: 900_000, failedAttempts: -1, reason: 'private text', exitStage: 'positioning' })).toEqual({ exercise: 'squat', cameraMs: 600_000, exitStage: 'positioning' });
    expect(trainingMetadata({ cameraMs: NaN, failedAttempts: 1.5 })).toEqual({});
  });
  it('rejects unknown events, malformed tokens and stale/future timestamps', () => {
    expect(readTrainingEnvelope(sample, now)).toEqual(sample);
    for (const invalid of [{ n: 'hack' }, { sid: 'tg:123' }, { id: '<script>' }, { v: 'private token:123' }, { at: now + 300_001 }, { at: now - 86_400_001 }]) expect(readTrainingEnvelope({ ...sample, ...invalid }, now)).toBeNull();
  });
  it('deduplicates milestones per attempt while allowing tracking episodes', () => {
    const events: string[] = [];
    const report = trainingReporter((n) => events.push(n));
    report('camera_ready'); report('camera_ready');
    report('tracking_lost'); report('tracking_lost');
    trainingReporter((n) => events.push(n))('camera_ready');
    expect(events).toEqual(['camera_ready', 'tracking_lost', 'tracking_lost', 'camera_ready']);
  });
});
