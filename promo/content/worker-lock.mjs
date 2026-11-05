import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { uptime } from 'node:os';

/** The Windows scheduler can leave a child alive after its launcher stops. */
export function acquireWorkerLock(file) {
  const boot = Date.now() - uptime() * 1000;
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    let fd;
    try { fd = openSync(file, 'wx'); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let active = false;
      try {
        const old = JSON.parse(readFileSync(file, 'utf8'));
        if (Number.isSafeInteger(old.pid) && old.pid > 0 && Math.abs(old.boot - boot) < 10_000) {
          try { process.kill(old.pid, 0); active = true; }
          catch (e) { active = e.code !== 'ESRCH'; }
        }
      } catch {
        // Another instance may have created the file and not written it yet.
        try { active = Date.now() - statSync(file).mtimeMs < 10_000; } catch { /* Already gone. */ }
      }
      if (active) return null;
      try { unlinkSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      continue;
    }
    try { writeFileSync(fd, JSON.stringify({ pid: process.pid, boot, token })); }
    finally { closeSync(fd); }
    return () => {
      try { if (JSON.parse(readFileSync(file, 'utf8')).token === token) unlinkSync(file); } catch { /* Lock is already gone. */ }
    };
  }
  return null;
}
