/**
 * ジェネレーター系テスト
 *
 * テストケース:
 * - 修理中フラグ: repair()呼び出しでbeingRepairedがtrueになる
 * - 修理中フラグ: idle()呼び出しでbeingRepairedがfalseにリセットされる
 * - 修理中フラグ: 1台修理中でも他のジェネレーターには影響しない
 * - キラー蹴り: beingRepaired中のジェネは蹴れない（progress>0, !beingRepaired条件）
 * - キラー蹴り: 修理されていないジェネは蹴れる
 * - 蹴りによる後退: kick()で進捗が減少し後退が開始する
 * - 修理再開: idle→repair→idle→repairでbeingRepairedが正しく切り替わる
 */

import { describe, it, expect } from 'vitest';
import { Generator } from '../entities/Generator';

describe('ジェネレーター修理状態', () => {
  it('repair()でbeingRepairedがtrueになる', () => {
    const gen = new Generator(5, 5);
    expect(gen.beingRepaired).toBe(false);
    gen.repair(1 / 60, 0);
    expect(gen.beingRepaired).toBe(true);
  });

  it('idle()でbeingRepairedがfalseにリセットされる', () => {
    const gen = new Generator(5, 5);
    gen.repair(1 / 60, 0);
    expect(gen.beingRepaired).toBe(true);

    gen.idle(1 / 60);
    expect(gen.beingRepaired).toBe(false);
  });

  it('1台修理中でも他のジェネレーターのbeingRepairedに影響しない', () => {
    const gen1 = new Generator(5, 5);
    const gen2 = new Generator(10, 10);

    // gen1のみ修理、gen2はidle
    gen1.repair(1 / 60, 0);
    gen2.idle(1 / 60);

    expect(gen1.beingRepaired).toBe(true);
    expect(gen2.beingRepaired).toBe(false);
  });

  it('修理を中断して再開するとbeingRepairedが正しく切り替わる', () => {
    const gen = new Generator(5, 5);

    // 修理開始
    gen.repair(1 / 60, 0);
    expect(gen.beingRepaired).toBe(true);

    // 中断（idle）
    gen.idle(1 / 60);
    expect(gen.beingRepaired).toBe(false);

    // 再開
    gen.repair(1 / 60, 0);
    expect(gen.beingRepaired).toBe(true);
  });
});

describe('ジェネレーター蹴り', () => {
  it('進捗がありbeingRepairedでないジェネレーターは蹴れる', () => {
    const gen = new Generator(5, 5);
    gen.repair(5, 0); // 進捗を上げる
    gen.idle(0); // beingRepaired = false

    const progressBefore = gen.progress;
    expect(progressBefore).toBeGreaterThan(0);
    expect(gen.beingRepaired).toBe(false);

    gen.kick();
    expect(gen.progress).toBeLessThan(progressBefore);
    expect(gen.regressing).toBe(true);
  });

  it('蹴りによる後退がidle中に進行する', () => {
    const gen = new Generator(5, 5);
    gen.repair(5, 0);
    gen.idle(0);

    gen.kick();
    const afterKick = gen.progress;

    // idle中に後退
    gen.idle(1);
    expect(gen.progress).toBeLessThan(afterKick);
  });

  it('完了したジェネレーターは蹴れない', () => {
    const gen = new Generator(5, 5);
    gen.progress = 1;
    gen.completed = true;

    gen.kick();
    expect(gen.progress).toBe(1);
    expect(gen.regressing).toBe(false);
  });

  it('進捗0のジェネレーターは蹴れない', () => {
    const gen = new Generator(5, 5);
    expect(gen.progress).toBe(0);

    gen.kick();
    expect(gen.regressing).toBe(false);
  });

  it('修理するとregressionが停止する', () => {
    const gen = new Generator(5, 5);
    gen.repair(5, 0);
    gen.idle(0);
    gen.kick();
    expect(gen.regressing).toBe(true);

    // 修理再開でregression停止
    gen.repair(1 / 60, 0);
    expect(gen.regressing).toBe(false);
  });
});
