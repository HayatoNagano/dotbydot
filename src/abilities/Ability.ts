export abstract class Ability {
  readonly name: string;
  readonly cooldown: number; // seconds
  readonly duration: number; // seconds (0 = instant)
  protected cooldownTimer = 0;
  protected activeTimer = 0;
  protected _isActive = false;

  constructor(name: string, cooldown: number, duration: number) {
    this.name = name;
    this.cooldown = cooldown;
    this.duration = duration;
  }

  get isReady(): boolean {
    return this.cooldownTimer <= 0 && !this._isActive;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  get cooldownRemaining(): number {
    return Math.max(0, this.cooldownTimer);
  }

  set cooldownRemaining(value: number) {
    this.cooldownTimer = value;
  }

  activate(): boolean {
    if (!this.isReady) return false;
    this._isActive = true;
    this.activeTimer = this.duration;
    this.onActivate();
    return true;
  }

  update(dt: number): void {
    if (this.cooldownTimer > 0) {
      this.cooldownTimer -= dt;
    }

    if (this._isActive) {
      if (this.duration > 0) {
        this.activeTimer -= dt;
        if (this.activeTimer <= 0) {
          this.deactivate();
        } else {
          this.onUpdate(dt);
        }
      } else {
        // Instant ability
        this.deactivate();
      }
    }
  }

  protected deactivate(): void {
    this._isActive = false;
    this.cooldownTimer = this.cooldown;
    this.onDeactivate();
  }

  protected abstract onActivate(): void;
  protected abstract onUpdate(dt: number): void;
  protected abstract onDeactivate(): void;
}
