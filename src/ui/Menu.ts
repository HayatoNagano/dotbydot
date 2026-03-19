import { Input } from '../core/Input';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';
import { audioManager } from '../audio/AudioManager';

export enum MenuState {
  Title = 'title',
  ModeSelect = 'mode_select',
  SurvivorSelect = 'survivor_select',
  KillerSelect = 'killer_select',
  Playing = 'playing',
}

export enum GameMode {
  Local2P = 'local_2p',
  VsCPU = 'vs_cpu',
}

export interface CharacterDef {
  id: string;
  name: string;
  nameJp: string;
  description: string;
  color: string;
  abilityName: string;
}

export const SURVIVOR_DEFS: CharacterDef[] = [
  { id: 'runner', name: 'Runner', nameJp: 'ランナー', description: 'スプリントバースト: 3秒間 速度2倍 (CT 40秒)', color: '#00ff88', abilityName: 'sprint_burst' },
  { id: 'dodger', name: 'Dodger', nameJp: 'ドッジャー', description: 'デッドハード: 0.5秒 無敵ダッシュ (CT 60秒)', color: '#00ccff', abilityName: 'dead_hard' },
];

export const KILLER_DEFS: CharacterDef[] = [
  { id: 'trapper', name: 'Trapper', nameJp: 'トラッパー', description: 'ベアトラップ: 罠を設置 (最大2個, CT 20秒)', color: '#ff2244', abilityName: 'trap' },
  { id: 'huntress', name: 'Huntress', nameJp: 'ハントレス', description: '斧投擲: 遠距離攻撃 (CT 10秒)', color: '#ff6644', abilityName: 'throw_axe' },
];

export interface MenuSelection {
  mode: GameMode;
  survivorDef: CharacterDef;
  killerDef: CharacterDef;
}

export class Menu {
  state: MenuState = MenuState.Title;
  mode: GameMode = GameMode.Local2P;
  selectedSurvivor = 0;
  selectedKiller = 0;
  private cursorIndex = 0;

  update(input: Input): MenuSelection | null {
    switch (this.state) {
      case MenuState.Title:
        if (input.wasPressed('Space') || input.wasPressed('Enter')) {
          this.state = MenuState.ModeSelect;
          this.cursorIndex = 0;
          audioManager.playMenuSelect();
        }
        break;

      case MenuState.ModeSelect:
        if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) {
          this.cursorIndex = (this.cursorIndex + 1) % 2;
          audioManager.playMenuMove();
        }
        if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) {
          this.cursorIndex = (this.cursorIndex + 1) % 2;
          audioManager.playMenuMove();
        }
        if (input.wasPressed('Space') || input.wasPressed('Enter')) {
          this.mode = this.cursorIndex === 0 ? GameMode.Local2P : GameMode.VsCPU;
          this.state = MenuState.SurvivorSelect;
          this.cursorIndex = 0;
          audioManager.playMenuSelect();
        }
        break;

      case MenuState.SurvivorSelect:
        if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) {
          this.cursorIndex = (this.cursorIndex + SURVIVOR_DEFS.length - 1) % SURVIVOR_DEFS.length;
          audioManager.playMenuMove();
        }
        if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) {
          this.cursorIndex = (this.cursorIndex + 1) % SURVIVOR_DEFS.length;
          audioManager.playMenuMove();
        }
        if (input.wasPressed('Space') || input.wasPressed('Enter')) {
          this.selectedSurvivor = this.cursorIndex;
          this.state = MenuState.KillerSelect;
          this.cursorIndex = 0;
          audioManager.playMenuSelect();
        }
        if (input.wasPressed('Escape')) {
          this.state = MenuState.ModeSelect;
          this.cursorIndex = 0;
          audioManager.playMenuMove();
        }
        break;

      case MenuState.KillerSelect:
        if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) {
          this.cursorIndex = (this.cursorIndex + KILLER_DEFS.length - 1) % KILLER_DEFS.length;
          audioManager.playMenuMove();
        }
        if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) {
          this.cursorIndex = (this.cursorIndex + 1) % KILLER_DEFS.length;
          audioManager.playMenuMove();
        }
        if (input.wasPressed('Space') || input.wasPressed('Enter')) {
          this.selectedKiller = this.cursorIndex;
          this.state = MenuState.Playing;
          audioManager.playMenuSelect();
          return {
            mode: this.mode,
            survivorDef: SURVIVOR_DEFS[this.selectedSurvivor],
            killerDef: KILLER_DEFS[this.selectedKiller],
          };
        }
        if (input.wasPressed('Escape')) {
          this.state = MenuState.SurvivorSelect;
          this.cursorIndex = 0;
          audioManager.playMenuMove();
        }
        break;
    }
    return null;
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    switch (this.state) {
      case MenuState.Title:
        this.renderTitle(ctx);
        break;
      case MenuState.ModeSelect:
        this.renderModeSelect(ctx);
        break;
      case MenuState.SurvivorSelect:
        this.renderCharSelect(ctx, 'サバイバーを選択', SURVIVOR_DEFS);
        break;
      case MenuState.KillerSelect:
        this.renderCharSelect(ctx, 'キラーを選択', KILLER_DEFS);
        break;
    }
  }

  private renderTitle(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';

    ctx.fillStyle = '#ff2244';
    ctx.font = 'bold 48px monospace';
    ctx.fillText('dot by dot', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80);

    ctx.fillStyle = '#888';
    ctx.font = '14px monospace';
    ctx.fillText('非対称型対戦ホラーゲーム', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);

    ctx.fillStyle = '#aaa';
    ctx.font = '16px monospace';
    const blink = Math.sin(Date.now() / 500) > 0;
    if (blink) {
      ctx.fillText('SPACE でスタート', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
    }

    ctx.textAlign = 'left';
  }

  private renderModeSelect(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('モード選択', CANVAS_WIDTH / 2, 150);

    const options = ['ローカル 2人対戦', 'CPU 対戦'];
    for (let i = 0; i < options.length; i++) {
      const y = 240 + i * 70;
      ctx.fillStyle = i === this.cursorIndex ? '#ff2244' : '#666';
      ctx.font = '20px monospace';
      ctx.fillText(options[i], CANVAS_WIDTH / 2, y);
      if (i === this.cursorIndex) {
        ctx.fillText('▶', CANVAS_WIDTH / 2 - 140, y);
      }
    }

    ctx.fillStyle = '#555';
    ctx.font = '12px monospace';
    ctx.fillText('↑↓: 選択　SPACE: 決定', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 60);
    ctx.textAlign = 'left';
  }

  private renderCharSelect(ctx: CanvasRenderingContext2D, title: string, defs: CharacterDef[]): void {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(title, CANVAS_WIDTH / 2, 100);

    for (let i = 0; i < defs.length; i++) {
      const y = 200 + i * 120;
      const selected = i === this.cursorIndex;

      // Character box
      ctx.fillStyle = selected ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(CANVAS_WIDTH / 2 - 220, y - 35, 440, 90);

      // Color swatch
      ctx.fillStyle = defs[i].color;
      ctx.fillRect(CANVAS_WIDTH / 2 - 200, y - 18, 30, 30);

      // Name
      ctx.fillStyle = selected ? '#fff' : '#888';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(defs[i].nameJp, CANVAS_WIDTH / 2, y);

      // Description
      ctx.fillStyle = selected ? '#aaa' : '#555';
      ctx.font = '12px monospace';
      ctx.fillText(defs[i].description, CANVAS_WIDTH / 2, y + 28);

      if (selected) {
        ctx.fillStyle = '#ff2244';
        ctx.font = '18px monospace';
        ctx.fillText('▶', CANVAS_WIDTH / 2 - 240, y + 5);
      }
    }

    ctx.fillStyle = '#555';
    ctx.font = '12px monospace';
    ctx.fillText('ESC: 戻る　↑↓: 選択　SPACE: 決定', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 60);
    ctx.textAlign = 'left';
  }
}
