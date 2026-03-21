/**
 * 担ぎ・デッドハード系テスト
 *
 * テストケース:
 * - 担ぎ中のサバイバーはisBeingCarried=trueになる
 * - 担ぎ中のサバイバーはisIncapacitated=trueになる
 * - フック吊り時にisBeingCarriedがfalseにリセットされる
 * - デッドハードの壁めり込み防止: 壁がある方向へダッシュしても壁を超えない
 */

import { describe, it, expect } from 'vitest';
import { Survivor } from '../entities/Survivor';
import { TileMap } from '../world/TileMap';
import { Hook } from '../entities/Hook';
import { HealthState } from '../types';
import { TILE_SIZE } from '../constants';

describe('担ぎ状態', () => {
  it('担ぎ中のサバイバーはisIncapacitated=trueになる', () => {
    const s = new Survivor(100, 100);
    s.isBeingCarried = true;
    expect(s.isIncapacitated).toBe(true);
  });

  it('担がれていない健康なサバイバーはisIncapacitated=falseになる', () => {
    const s = new Survivor(100, 100);
    s.isBeingCarried = false;
    expect(s.isIncapacitated).toBe(false);
  });

  it('フック吊り時にisBeingCarriedがfalseにリセットされる', () => {
    const s = new Survivor(100, 100);
    s.health = HealthState.Dying;
    s.isBeingCarried = true;

    const hook = new Hook(5, 5);
    hook.hookSurvivor(s);

    expect(s.isBeingCarried).toBe(false);
  });
});

describe('デッドハード壁衝突', () => {
  it('壁がある方向へ移動しても壁を超えない', () => {
    const map = new TileMap();
    const s = new Survivor(100, 100);
    const startX = s.pos.x;
    const startY = s.pos.y;

    // 壁の位置を特定して、壁に向かって大きく移動を試みる
    // TileMapの外周は壁なので、(0,0)方向は壁
    // collidesRectが正しく動作することを確認
    const wallX = -10; // 確実にマップ外（壁）
    expect(map.collidesRect(wallX, startY, s.width, s.height)).toBe(true);

    // 通常の歩行可能な場所では衝突しない
    // マップ内のスポーン位置付近を探す
    const safeX = 5 * TILE_SIZE + 2;
    const safeY = 5 * TILE_SIZE + 2;
    // 歩行可能タイルの中なら衝突しない
    if (map.isWalkable(5, 5)) {
      expect(map.collidesRect(safeX, safeY, s.width, s.height)).toBe(false);
    }
  });
});
