import { expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireWorkerLock } from './worker-lock.mjs';

it('allows one worker and recovers a lock from a previous Windows boot', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arena-lock-')); const file = join(dir, 'worker.lock');
  try {
    const release = acquireWorkerLock(file);
    expect(release).toBeTypeOf('function'); expect(acquireWorkerLock(file)).toBeNull();
    release();
    writeFileSync(file, JSON.stringify({ pid: process.pid, boot: 0 }));
    const next = acquireWorkerLock(file); expect(next).toBeTypeOf('function'); next();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
