/**
 * スキルチェック系テスト
 *
 * テストケース:
 * - スキルチェックはサバイバーごとに独立している
 * - trigger()でスキルチェックが開始する
 * - 既にactiveな状態でtrigger()しても二重起動しない
 * - カーソルが1周するとミスになる
 * - ターゲットゾーン内でhit()するとgoodになる
 * - グレートゾーン内でhit()するとgreatになる
 * - ゾーン外でhit()するとmissになる
 * - hit()後に結果が一定時間表示される
 * - showResult()でネットワーク経由の結果を設定できる
 */

import { describe, it, expect } from 'vitest';
import { SkillCheck } from '../ui/SkillCheck';

describe('スキルチェック独立性', () => {
  it('2つのスキルチェックインスタンスは独立して動作する', () => {
    const sc1 = new SkillCheck();
    const sc2 = new SkillCheck();

    sc1.trigger();
    expect(sc1.active).toBe(true);
    expect(sc2.active).toBe(false);

    sc2.trigger();
    expect(sc1.active).toBe(true);
    expect(sc2.active).toBe(true);

    sc1.hit();
    expect(sc1.active).toBe(false);
    expect(sc2.active).toBe(true);
  });

  it('片方のスキルチェックの結果がもう片方に影響しない', () => {
    const sc1 = new SkillCheck();
    const sc2 = new SkillCheck();

    sc1.trigger();
    sc1.hit(); // miss (cursor at 0, outside target)
    expect(sc1.lastResult).toBe('miss');
    expect(sc2.lastResult).toBe('none');
  });
});

describe('スキルチェック基本動作', () => {
  it('trigger()でactiveになる', () => {
    const sc = new SkillCheck();
    expect(sc.active).toBe(false);
    sc.trigger();
    expect(sc.active).toBe(true);
    expect(sc.cursor).toBe(0);
  });

  it('activeな状態でtrigger()しても二重起動しない', () => {
    const sc = new SkillCheck();
    sc.trigger();
    const originalTarget = sc.targetStart;
    sc.trigger(); // 二重呼び出し
    expect(sc.targetStart).toBe(originalTarget);
  });

  it('update()でカーソルが進む', () => {
    const sc = new SkillCheck();
    sc.trigger();
    sc.update(0.1);
    expect(sc.cursor).toBeGreaterThan(0);
  });

  it('カーソルが1周するとミスになりactiveがfalseになる', () => {
    const sc = new SkillCheck();
    sc.trigger();
    // カーソルを1周ギリギリまで進めてからミスさせる
    sc.update(0.65); // cursor = 1.5 * 0.65 = 0.975 (まだactive)
    expect(sc.active).toBe(true);
    sc.update(0.03); // cursor = 0.975 + 1.5 * 0.03 = 1.02 > 1 → ミス、resultTimer -= 0.03 → 0.47
    expect(sc.active).toBe(false);
    expect(sc.lastResult).toBe('miss');
    expect(sc.isShowingResult).toBe(true);
  });
});

describe('スキルチェック判定', () => {
  it('ターゲットゾーン内でhit()するとgoodになる', () => {
    const sc = new SkillCheck();
    sc.trigger();
    // カーソルをターゲットゾーンの中央に配置
    sc.cursor = sc.targetStart + sc.targetWidth / 2;
    // ただしグレートゾーン外になるよう調整
    if (sc.cursor >= sc.greatStart && sc.cursor <= sc.greatStart + sc.greatWidth) {
      sc.cursor = sc.targetStart + 0.01; // ターゲット先頭付近（グレート外）
    }
    const result = sc.hit();
    expect(result).toBe('good');
    expect(sc.active).toBe(false);
  });

  it('グレートゾーン内でhit()するとgreatになる', () => {
    const sc = new SkillCheck();
    sc.trigger();
    sc.cursor = sc.greatStart + sc.greatWidth / 2;
    const result = sc.hit();
    expect(result).toBe('great');
  });

  it('ゾーン外でhit()するとmissになる', () => {
    const sc = new SkillCheck();
    sc.trigger();
    sc.cursor = 0.01; // targetStartは0.3以上なので確実にゾーン外
    const result = sc.hit();
    expect(result).toBe('miss');
  });
});

describe('スキルチェック結果表示', () => {
  it('hit()後に結果が一定時間表示される', () => {
    const sc = new SkillCheck();
    sc.trigger();
    sc.hit();
    expect(sc.isShowingResult).toBe(true);

    // 時間経過で消える
    sc.update(1.0);
    expect(sc.isShowingResult).toBe(false);
  });

  it('showResult()でネットワーク経由の結果を設定できる', () => {
    const sc = new SkillCheck();
    sc.showResult('great');
    expect(sc.active).toBe(false);
    expect(sc.isShowingResult).toBe(true);
    expect(sc.lastResult).toBe('great');
  });

  it('showResult()後にupdate()で結果表示が消える', () => {
    const sc = new SkillCheck();
    sc.showResult('good');
    expect(sc.isShowingResult).toBe(true);
    sc.update(1.0);
    expect(sc.isShowingResult).toBe(false);
  });
});
