import { describe, it, expect } from 'vitest';
import { Survivor } from '../entities/Survivor';
import { HealthState } from '../types';

describe('Survivor', () => {
  it('starts healthy', () => {
    const s = new Survivor(100, 100);
    expect(s.health).toBe(HealthState.Healthy);
  });

  it('transitions health states on damage', () => {
    const s = new Survivor(100, 100);
    s.takeDamage();
    expect(s.health).toBe(HealthState.Injured);
    s.takeDamage();
    expect(s.health).toBe(HealthState.Dying);
  });

  it('is incapacitated when dying', () => {
    const s = new Survivor(100, 100);
    expect(s.isIncapacitated).toBe(false);
    s.takeDamage();
    expect(s.isIncapacitated).toBe(false);
    s.takeDamage();
    expect(s.isIncapacitated).toBe(true);
  });
});
