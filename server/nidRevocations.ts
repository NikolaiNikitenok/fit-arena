import type { NidConfig } from './habit';

/** Local validation stays synchronous; authenticated ID refreshes expire closed after two minutes. */
export class NidRevocations {
  private versions: Record<string, number> = {};
  private refreshed = 0;
  private timer: ReturnType<typeof setInterval>;
  constructor(private cfg: Pick<NidConfig, 'internal' | 'clientId' | 'secret' | 'fetch'>) {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 30_000);
    this.timer.unref();
  }
  async refresh(): Promise<void> {
    try {
      const r = await (this.cfg.fetch ?? fetch)(`${this.cfg.internal}/api/revocations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: this.cfg.clientId, client_secret: this.cfg.secret }),
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) return;
      const body = await r.json() as { versions: Record<string, number> };
      if (!body.versions || typeof body.versions !== 'object') return;
      this.versions = body.versions; this.refreshed = Date.now();
    } catch { /* Existing cached state has a bounded lifetime. */ }
  }
  accepts(nid: string, version = 0): boolean {
    return this.refreshed > 0 && Date.now() - this.refreshed < 120_000 && (this.versions[nid] ?? 0) <= version;
  }
  close(): void { clearInterval(this.timer); }
}
