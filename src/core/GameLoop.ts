import { TICK_DURATION } from '../constants';

export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private rafId = 0;

  constructor(
    private onUpdate: (dt: number) => void,
    private onRender: (alpha: number) => void,
  ) {}

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame((t) => this.tick(t));
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick(now: number): void {
    if (!this.running) return;

    const frameTime = Math.min((now - this.lastTime) / 1000, 0.1); // cap at 100ms
    this.lastTime = now;
    this.accumulator += frameTime;

    while (this.accumulator >= TICK_DURATION) {
      this.onUpdate(TICK_DURATION);
      this.accumulator -= TICK_DURATION;
    }

    const alpha = this.accumulator / TICK_DURATION;
    this.onRender(alpha);

    this.rafId = requestAnimationFrame((t) => this.tick(t));
  }
}
