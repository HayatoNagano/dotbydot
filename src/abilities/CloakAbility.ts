import { Ability } from './Ability';
import { Killer } from '../entities/Killer';
import { KILLER_BASE_SPEED } from '../constants';

/**
 * Wraith's Cloak ability — toggle between invisible/visible states.
 *
 * Cloaked:   invisible to survivors, 1.25× speed, cannot attack
 * Uncloaking: 2-second bell transition → uncloaked
 * Uncloaked:  normal killer, can attack
 * Cloaking:   1-second bell transition → cloaked
 *
 * CloakState values: 0=Cloaked, 1=Uncloaking, 2=Uncloaked, 3=Cloaking
 */

export const CLOAK_SPEED_MULT = 1.25;
const UNCLOAK_DURATION = 2.0; // seconds to uncloak (カーンカーン)
const CLOAK_DURATION = 1.0;   // seconds to cloak (カーン)

export class CloakAbility extends Ability {
  private killer: Killer;

  constructor(killer: Killer) {
    super('Cloak', 0, 0); // no cooldown, custom duration management
    this.killer = killer;
    // Start cloaked
    this.killer.cloakState = 0;
    this.killer.cloakProgress = 0; // 0 = invisible, 1 = visible
    this.killer.speed = KILLER_BASE_SPEED * CLOAK_SPEED_MULT;
  }

  /** Toggle cloak — returns true if transition started */
  activate(): boolean {
    const state = this.killer.cloakState;
    if (state === 1 || state === 3) return false; // already transitioning

    if (state === 0) {
      // Cloaked → start uncloaking
      this.killer.cloakState = 1;
      this.killer.cloakProgress = 0;
      this.killer.speed = KILLER_BASE_SPEED; // normal speed during uncloak
      this._isActive = true;
      return true;
    } else {
      // Uncloaked → start cloaking
      this.killer.cloakState = 3;
      this.killer.cloakProgress = 1;
      this.killer.speed = KILLER_BASE_SPEED; // normal speed during cloak
      this._isActive = true;
      return true;
    }
  }

  update(dt: number): void {
    const state = this.killer.cloakState;

    if (state === 1) {
      // Uncloaking: progress 0 → 1 over UNCLOAK_DURATION
      this.killer.cloakProgress += dt / UNCLOAK_DURATION;
      if (this.killer.cloakProgress >= 1) {
        this.killer.cloakProgress = 1;
        this.killer.cloakState = 2; // fully uncloaked
        this.killer.speed = KILLER_BASE_SPEED;
        this._isActive = false;
      }
    } else if (state === 3) {
      // Cloaking: progress 1 → 0 over CLOAK_DURATION
      this.killer.cloakProgress -= dt / CLOAK_DURATION;
      if (this.killer.cloakProgress <= 0) {
        this.killer.cloakProgress = 0;
        this.killer.cloakState = 0; // fully cloaked
        this.killer.speed = KILLER_BASE_SPEED * CLOAK_SPEED_MULT;
        this._isActive = false;
      }
    }
  }

  /** Force to a specific state (for network sync) */
  forceActivate(): void {
    this._isActive = true;
  }

  deactivate(): void {
    this._isActive = false;
  }

  /** Sync cloak state from server */
  syncState(cloakState: number, cloakProgress: number): void {
    this.killer.cloakState = cloakState;
    this.killer.cloakProgress = cloakProgress;
    this._isActive = cloakState === 1 || cloakState === 3;

    // Sync speed
    if (cloakState === 0) {
      this.killer.speed = KILLER_BASE_SPEED * CLOAK_SPEED_MULT;
    } else {
      this.killer.speed = KILLER_BASE_SPEED;
    }
  }

  protected onActivate(): void { /* managed by activate() */ }
  protected onUpdate(_dt: number): void { /* managed by update() */ }
  protected onDeactivate(): void { /* managed by deactivate() */ }
}
