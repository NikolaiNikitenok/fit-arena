export type TrainingState = 'IDLE' | 'CAMERA_LOADING' | 'POSITIONING' | 'READY' | 'COUNTDOWN' | 'ACTIVE' | 'TRACKING_LOST' | 'COMPLETED' | 'CANCELLED' | 'ERROR';

/** Monotonic camera clock. Tracking loss never extends an active attempt. */
export class TrainingLifecycle {
  state: TrainingState = 'IDLE';
  private stableSince: number | null = null;
  private lastFrame: number | null = null;
  private countdownAt = 0;
  private requested = false;
  constructor(readonly stableMs = 1500, readonly countdownMs = 3000, readonly maxFrameGapMs = 750) {}
  load(): void { this.state = 'CAMERA_LOADING'; }
  cameraReady(auto = false): void { this.state = 'POSITIONING'; this.requested = auto; }
  requestStart(): boolean {
    if (this.state !== 'READY') return false;
    this.requested = true;
    return true;
  }
  frame(ok: boolean, now: number): TrainingState {
    if (['IDLE', 'CAMERA_LOADING', 'COMPLETED', 'CANCELLED', 'ERROR'].includes(this.state)) return this.state;
    // A suspended tab or stalled inference is not evidence of a stable pose.
    const continuous = this.lastFrame === null || now - this.lastFrame <= this.maxFrameGapMs;
    this.lastFrame = now;
    if (this.state === 'ACTIVE' || this.state === 'TRACKING_LOST') {
      this.state = ok ? 'ACTIVE' : 'TRACKING_LOST';
      return this.state;
    }
    if (!ok || !continuous) {
      this.stableSince = null;
      this.state = 'POSITIONING';
      return this.state;
    }
    this.stableSince ??= now;
    if (this.state === 'COUNTDOWN') {
      if (now - this.countdownAt >= this.countdownMs) this.state = 'ACTIVE';
    } else if (now - this.stableSince >= this.stableMs) {
      this.state = 'READY';
      if (this.requested) { this.state = 'COUNTDOWN'; this.countdownAt = now; }
    }
    return this.state;
  }
  seconds(now: number): number { return this.state === 'COUNTDOWN' ? Math.max(0, Math.ceil((this.countdownMs - now + this.countdownAt) / 1000)) : 0; }
  end(state: 'COMPLETED' | 'CANCELLED' | 'ERROR'): void { this.state = state; }
}
