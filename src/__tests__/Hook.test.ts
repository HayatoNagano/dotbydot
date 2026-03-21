/**
 * フック系テスト
 *
 * テストケース:
 * - 1回目のフック: ステージ1に設定される
 * - 2回目のフック: ステージ2に設定される
 * - 3回目のフック: サバイバーが即死する
 * - ステージ2で耐久タイマーが尽きるとサバイバーが死亡する
 * - 救助: 味方がインタラクトし続けるとフックから解放される
 * - 救助後のサバイバーは負傷状態になる
 * - セルフアンフック: スペース連打で脱出できる
 * - セルフアンフックは1回しか使えない
 */

import { describe, it, expect } from 'vitest';
import { Hook } from '../entities/Hook';
import { Survivor } from '../entities/Survivor';
import { HealthState } from '../types';
import { HOOK_STAGE_DURATION, HOOK_RESCUE_TIME } from '../constants';

function createHookedSurvivor(): { hook: Hook; survivor: Survivor } {
  const hook = new Hook(5, 5);
  const survivor = new Survivor(100, 100);
  survivor.health = HealthState.Dying;
  return { hook, survivor };
}

describe('フック', () => {
  it('1回目のフックでステージ1になる', () => {
    const { hook, survivor } = createHookedSurvivor();
    hook.hookSurvivor(survivor);
    expect(hook.stage).toBe(1);
    expect(survivor.hookStage).toBe(1);
    expect(hook.hooked).toBe(survivor);
  });

  it('2回目のフックでステージ2になる', () => {
    const { hook, survivor } = createHookedSurvivor();
    hook.hookSurvivor(survivor);
    hook.release();

    const hook2 = new Hook(6, 6);
    hook2.hookSurvivor(survivor);
    expect(hook2.stage).toBe(2);
    expect(survivor.hookStage).toBe(2);
    expect(hook2.hooked).toBe(survivor);
  });

  it('3回目のフックでサバイバーが即死する', () => {
    const { hook, survivor } = createHookedSurvivor();
    // 1回目
    hook.hookSurvivor(survivor);
    hook.release();
    // 2回目
    survivor.health = HealthState.Dying;
    hook.hookSurvivor(survivor);
    hook.release();
    // 3回目
    survivor.health = HealthState.Dying;
    const hook3 = new Hook(7, 7);
    hook3.hookSurvivor(survivor);

    expect(survivor.health).toBe(HealthState.Dead);
    expect(survivor.hookStage).toBe(3);
    // 即死なのでフックからは解放される
    expect(hook3.hooked).toBeNull();
  });

  it('ステージ2で耐久タイマーが尽きるとサバイバーが死亡する', () => {
    const { hook, survivor } = createHookedSurvivor();
    hook.hookSurvivor(survivor);
    hook.release();

    survivor.health = HealthState.Dying;
    const hook2 = new Hook(6, 6);
    hook2.hookSurvivor(survivor);
    expect(hook2.stage).toBe(2);

    // タイマーを進めて耐久を尽きさせる
    hook2.update(HOOK_STAGE_DURATION + 0.1);

    expect(survivor.health).toBe(HealthState.Dead);
    expect(hook2.hooked).toBeNull();
  });

  it('ステージ1で耐久タイマーが尽きるとステージ2に進む（死なない）', () => {
    const { hook, survivor } = createHookedSurvivor();
    hook.hookSurvivor(survivor);
    expect(hook.stage).toBe(1);

    hook.update(HOOK_STAGE_DURATION + 0.1);

    expect(hook.stage).toBe(2);
    expect(survivor.health).not.toBe(HealthState.Dead);
    expect(hook.hooked).toBe(survivor);
  });
});

describe('フック救助', () => {
  it('味方がインタラクトし続けるとフックから解放される', () => {
    const { hook, survivor } = createHookedSurvivor();
    hook.hookSurvivor(survivor);

    // 救助を少しずつ進める
    let completed = false;
    const step = 0.1;
    for (let t = 0; t < HOOK_RESCUE_TIME + step; t += step) {
      if (hook.rescue(step)) {
        completed = true;
        break;
      }
    }

    expect(completed).toBe(true);
    expect(hook.hooked).toBeNull();
  });

  it('救助後のサバイバーは負傷状態になる', () => {
    const { hook, survivor } = createHookedSurvivor();
    hook.hookSurvivor(survivor);

    // 一気に救助完了
    hook.rescue(HOOK_RESCUE_TIME + 0.1);

    expect(survivor.health).toBe(HealthState.Injured);
  });

  it('救助を中断すると進捗が減衰する', () => {
    const { hook, survivor } = createHookedSurvivor();
    hook.hookSurvivor(survivor);

    // 途中まで救助
    hook.rescue(HOOK_RESCUE_TIME * 0.5);
    const progressBefore = hook.rescueProgress;
    expect(progressBefore).toBeGreaterThan(0);

    // 1回目のupdateでbeingRescuedがfalseにリセットされる
    hook.update(0.01);
    // 2回目のupdateでbeingRescued=falseなので減衰する
    hook.update(0.1);
    expect(hook.rescueProgress).toBeLessThan(progressBefore);
  });
});

describe('セルフアンフック', () => {
  it('スペース連打で脱出できる', () => {
    const { hook, survivor } = createHookedSurvivor();
    hook.hookSurvivor(survivor);

    let unhooked = false;
    for (let i = 0; i < 20; i++) {
      if (hook.attemptSelfUnhook()) {
        unhooked = true;
        break;
      }
    }

    expect(unhooked).toBe(true);
    expect(hook.hooked).toBeNull();
    expect(survivor.health).toBe(HealthState.Injured);
  });

  it('セルフアンフックは1回しか使えない', () => {
    const { hook, survivor } = createHookedSurvivor();
    hook.hookSurvivor(survivor);

    // 1回目のセルフアンフック成功
    for (let i = 0; i < 20; i++) {
      if (hook.attemptSelfUnhook()) break;
    }
    expect(survivor.selfUnhookUsed).toBe(true);

    // 2回目のフック
    survivor.health = HealthState.Dying;
    const hook2 = new Hook(6, 6);
    hook2.hookSurvivor(survivor);

    // 2回目はセルフアンフック不可
    expect(hook2.canSelfUnhook).toBe(false);
    const result = hook2.attemptSelfUnhook();
    expect(result).toBe(false);
  });
});
