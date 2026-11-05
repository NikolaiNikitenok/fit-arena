import { describe, expect, it } from 'vitest';
import { Telemetry } from './telemetry';

describe('training telemetry ingestion', () => {
  const now = 1_800_000_000_000;
  const event = (id: string, cameraMs = 1500) => ({ n: 'camera_ready', sid: 'random_session_123', id, at: now, v: 'v1', m: { cameraMs, landmarks: 'DO_NOT_STORE' } });
  const body = (events: unknown[]) => ({ anon: 'a'.repeat(32), events });
  it('accepts lifecycle events and deduplicates replay within bounded cache', () => {
    const t = new Telemetry(null, () => now, Buffer.alloc(32, 1));
    t.ingest(body([event('1'), event('2', 2500)]), '1');
    t.ingest(body([event('1')]), '1');
    expect(t.stats(1).dau[0].events).toMatchObject({ camera_ready: 2, 'camera_ready:duration_ms': 4000, 'camera_ready:duration_samples': 2 });
    // Same event ID belongs to another app session, hence another event.
    t.ingest(body([{ ...event('1'), sid: 'different_session_123' }]), '1');
    expect(t.stats(1).dau[0].events.camera_ready).toBe(3);
    const data = JSON.stringify((t as unknown as { data: unknown }).data);
    expect(data).not.toContain('DO_NOT_STORE');
    expect(data).not.toContain('random_session_123');
  });
  it('aggregates bounded recognition attempts and exit stages without storing metadata', () => {
    const t = new Telemetry(null, () => now, Buffer.alloc(32, 1));
    t.ingest(body([
      { ...event('1'), n: 'positioning_completed', m: { failedAttempts: 2 } },
      { ...event('2'), n: 'exercise_abandoned', m: { exitStage: 'positioning', reason: 'cancelled' } },
    ]), '1');
    expect(t.stats(1).dau[0].events).toMatchObject({
      'positioning_completed:failed_attempts': 2, 'positioning_completed:attempt_samples': 1,
      'exercise_abandoned:stage_positioning': 1, 'exercise_abandoned:cancelled': 1,
    });
  });
  it('preserves legacy aggregates and rejects incomplete new envelopes', () => {
    const t = new Telemetry(null, () => now, Buffer.alloc(32, 1));
    t.ingest(body([{ n: 'camera_granted' }, { n: 'camera_ready' }, { ...event('1'), at: 0 }]), '1');
    expect(t.stats(1).dau[0].events).toMatchObject({ camera_granted: 1 });
    expect(t.stats(1).dau[0].events.camera_ready).toBeUndefined();
  });
});
