import { Input } from '../core/Input';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';
import { audioManager } from '../audio/AudioManager';
import { renderPixelTitle } from '../rendering/PixelTitle';
import { renderCampfireScene } from '../rendering/CampfireScene';

export enum MenuState {
  Title = 'title',
  ModeSelect = 'mode_select',
  RoleSelect = 'role_select',
  SurvivorSelect = 'survivor_select',
  KillerSelect = 'killer_select',
  Playing = 'playing',
}

export enum GameMode {
  Local2P = 'local_2p',
  VsCPU = 'vs_cpu',
}

export enum PlayerRole {
  Survivor = 'survivor',
  Killer = 'killer',
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
  { id: 'runner', name: 'Dwight', nameJp: 'ドワット', description: 'スプリントバースト: 3秒間 速度2倍 (CT 40秒)', color: '#00ff88', abilityName: 'sprint_burst' },
  { id: 'dodger', name: 'Fenley', nameJp: 'フェンリー', description: 'デッドハード: 0.5秒 無敵ダッシュ (CT 60秒)', color: '#00ccff', abilityName: 'dead_hard' },
];

export const KILLER_DEFS: CharacterDef[] = [
  { id: 'trapper', name: 'Trapper', nameJp: 'トラッパー', description: 'ベアトラップ: 罠を設置 (最大2個, CT 20秒)', color: '#ff2244', abilityName: 'trap' },
  { id: 'huntress', name: 'Huntress', nameJp: 'ハントレス', description: '斧投擲: 遠距離攻撃 (CT 10秒)', color: '#ff6644', abilityName: 'throw_axe' },
];

export interface MenuSelection {
  mode: GameMode;
  playerRole: PlayerRole;
  survivorDef: CharacterDef;
  killerDef: CharacterDef;
}

export class Menu {
  state: MenuState = MenuState.Title;
  mode: GameMode = GameMode.Local2P;
  playerRole: PlayerRole = PlayerRole.Survivor;
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
          if (this.mode === GameMode.VsCPU) {
            this.state = MenuState.RoleSelect;
          } else {
            this.playerRole = PlayerRole.Survivor; // not relevant for 2P
            this.state = MenuState.SurvivorSelect;
          }
          this.cursorIndex = 0;
          audioManager.playMenuSelect();
        }
        break;

      case MenuState.RoleSelect:
        if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) {
          this.cursorIndex = (this.cursorIndex + 1) % 2;
          audioManager.playMenuMove();
        }
        if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) {
          this.cursorIndex = (this.cursorIndex + 1) % 2;
          audioManager.playMenuMove();
        }
        if (input.wasPressed('Space') || input.wasPressed('Enter')) {
          this.playerRole = this.cursorIndex === 0 ? PlayerRole.Survivor : PlayerRole.Killer;
          this.state = MenuState.SurvivorSelect;
          this.cursorIndex = 0;
          audioManager.playMenuSelect();
        }
        if (input.wasPressed('Escape')) {
          this.state = MenuState.ModeSelect;
          this.cursorIndex = 0;
          audioManager.playMenuMove();
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
          this.state = this.mode === GameMode.VsCPU ? MenuState.RoleSelect : MenuState.ModeSelect;
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
            playerRole: this.playerRole,
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
      case MenuState.RoleSelect:
        this.renderRoleSelect(ctx);
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
    const t = Date.now() / 1000;
    const CX = CANVAS_WIDTH / 2;
    const CY = CANVAS_HEIGHT / 2;

    // ─── Multi-layer background ───
    // Base: near-black
    ctx.fillStyle = '#030102';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Vignette with pulsing red center
    const pulse = 0.5 + Math.sin(t * 0.8) * 0.15;
    const grd = ctx.createRadialGradient(CX, CY - 60, 30, CX, CY - 60, CANVAS_WIDTH * 0.75);
    grd.addColorStop(0, `rgba(40, 5, 10, ${pulse})`);
    grd.addColorStop(0.3, 'rgba(15, 3, 6, 0.9)');
    grd.addColorStop(0.7, 'rgba(5, 1, 3, 1)');
    grd.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Drifting fog layers (many, slow-moving)
    for (let layer = 0; layer < 3; layer++) {
      ctx.globalAlpha = 0.02 + layer * 0.01;
      for (let i = 0; i < 6; i++) {
        const speed = 0.15 + layer * 0.08;
        const fx = CX + Math.sin(t * speed + i * 2.3 + layer * 1.1) * (250 + layer * 50);
        const fy = CY - 40 + Math.cos(t * (speed * 0.7) + i * 1.7 + layer * 0.9) * (120 + layer * 30);
        const r = 80 + layer * 30 + Math.sin(t * 0.4 + i + layer) * 20;
        const fog = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
        fog.addColorStop(0, layer === 2 ? '#441122' : '#882233');
        fog.addColorStop(1, 'transparent');
        ctx.fillStyle = fog;
        ctx.fillRect(fx - r, fy - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;

    // Ground mist at bottom
    const mistGrad = ctx.createLinearGradient(0, CANVAS_HEIGHT - 80, 0, CANVAS_HEIGHT);
    mistGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    mistGrad.addColorStop(0.5, 'rgba(20, 8, 12, 0.3)');
    mistGrad.addColorStop(1, 'rgba(30, 10, 15, 0.5)');
    ctx.fillStyle = mistGrad;
    ctx.fillRect(0, CANVAS_HEIGHT - 80, CANVAS_WIDTH, 80);

    // Drifting mist particles at bottom
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 10; i++) {
      const mx = ((t * 15 + i * 90) % (CANVAS_WIDTH + 100)) - 50;
      const my = CANVAS_HEIGHT - 30 + Math.sin(t * 0.5 + i * 1.3) * 15;
      const mr = 30 + Math.sin(i * 2.1) * 10;
      const mist = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
      mist.addColorStop(0, '#554444');
      mist.addColorStop(1, 'transparent');
      ctx.fillStyle = mist;
      ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    }
    ctx.globalAlpha = 1;

    // ─── Pixel art title ───
    renderPixelTitle(ctx, CX, CY - 80);

    // ─── Subtitle with glow ───
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = 'rgba(180, 30, 50, 0.4)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#774444';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('非 対 称 型 対 戦 ホ ラ ー ゲ ー ム', CX, CY + 20);
    ctx.restore();

    // ─── Campfire scene (bottom half) ───
    renderCampfireScene(ctx, CX, CY + 110, CANVAS_WIDTH * 0.8);

    // ─── Blinking prompt with fade effect ───
    const blinkAlpha = Math.sin(t * 3) * 0.5 + 0.5;
    ctx.save();
    ctx.globalAlpha = blinkAlpha;
    ctx.shadowColor = '#ff3344';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#bb4444';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('— SPACE でスタート —', CX, CANVAS_HEIGHT - 40);
    ctx.restore();

    // ─── Scanline overlay for retro feel ───
    ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
    for (let sy = 0; sy < CANVAS_HEIGHT; sy += 3) {
      ctx.fillRect(0, sy, CANVAS_WIDTH, 1);
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

  private renderRoleSelect(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('プレイする役割を選択', CANVAS_WIDTH / 2, 150);

    const options = [
      { label: 'サバイバーでプレイ', desc: 'キラーから逃げて脱出しよう', color: '#00ff88' },
      { label: 'キラーでプレイ', desc: 'サバイバーを追い詰めよう', color: '#ff2244' },
    ];
    for (let i = 0; i < options.length; i++) {
      const y = 240 + i * 80;
      ctx.fillStyle = i === this.cursorIndex ? options[i].color : '#666';
      ctx.font = '20px monospace';
      ctx.fillText(options[i].label, CANVAS_WIDTH / 2, y);
      ctx.fillStyle = i === this.cursorIndex ? '#aaa' : '#444';
      ctx.font = '12px monospace';
      ctx.fillText(options[i].desc, CANVAS_WIDTH / 2, y + 25);
      if (i === this.cursorIndex) {
        ctx.fillStyle = options[i].color;
        ctx.font = '20px monospace';
        ctx.fillText('▶', CANVAS_WIDTH / 2 - 170, y);
      }
    }

    ctx.fillStyle = '#555';
    ctx.font = '12px monospace';
    ctx.fillText('ESC: 戻る　↑↓: 選択　SPACE: 決定', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 60);
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
