import { Input } from '../core/Input';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';
import { audioManager } from '../audio/AudioManager';
import { renderPixelTitle } from '../rendering/PixelTitle';
import { renderCampfireScene } from '../rendering/CampfireScene';
import { resetStoryScene, updateStoryScene, renderStoryScene } from '../rendering/StoryScene';
import { Survivor } from '../entities/Survivor';
import { Killer } from '../entities/Killer';
import { Direction } from '../types';

export enum MenuState {
  Title = 'title',
  ModeSelect = 'mode_select',
  RoleSelect = 'role_select',
  SurvivorSelect = 'survivor_select',
  KillerSelect = 'killer_select',
  Playing = 'playing',
  Controls = 'controls',
  Story = 'story',
  // Online states
  OnlineLobby = 'online_lobby',
  OnlineWaiting = 'online_waiting',
  OnlineJoinInput = 'online_join_input',
  OnlineReady = 'online_ready',
  OnlineCharWait = 'online_char_wait',
}

export enum GameMode {
  VsCPU = 'vs_cpu',
  Online = 'online',
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
  mode: GameMode = GameMode.VsCPU;
  playerRole: PlayerRole = PlayerRole.Survivor;
  selectedSurvivor = 0;
  selectedKiller = 0;
  private cursorIndex = 0;

  // Preview characters for selection screen
  private previewSurvivor: Survivor;
  private previewKiller: Killer;
  private previewTime = 0;
  private previewDir = 0; // cycles through directions

  // Online state
  onlineRole: 'host' | 'guest' | null = null;
  roomCode = '';
  roomCodeInput = '';
  onlineError: string | null = null;
  opponentJoined = false;
  /** Callback: called when user wants to create a room */
  onCreateRoom: (() => void) | null = null;
  /** Callback: called when user wants to join a room */
  onJoinRoom: ((code: string) => void) | null = null;
  /** Callback: called when user starts the online game */
  onOnlineStart: (() => void) | null = null;
  /** Callback: called when user selects their character in online mode */
  onCharSelect: ((defId: string) => void) | null = null;
  /** Set by main.ts when opponent's char_select is received */
  opponentCharDefId: string | null = null;

  constructor() {
    this.previewSurvivor = new Survivor(0, 0);
    this.previewKiller = new Killer(0, 0);
  }

  update(input: Input): MenuSelection | null {
    switch (this.state) {
      case MenuState.Title:
        if (input.wasPressed('Space') || input.wasPressed('Enter')) {
          this.state = MenuState.ModeSelect;
          this.cursorIndex = 0;
          audioManager.playMenuSelect();
        }
        break;

      case MenuState.ModeSelect: {
        const modeCount = 4;
        if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) {
          this.cursorIndex = (this.cursorIndex + modeCount - 1) % modeCount;
          audioManager.playMenuMove();
        }
        if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) {
          this.cursorIndex = (this.cursorIndex + 1) % modeCount;
          audioManager.playMenuMove();
        }
        if (input.wasPressed('Space') || input.wasPressed('Enter')) {
          if (this.cursorIndex === 0) {
            this.mode = GameMode.VsCPU;
            this.state = MenuState.RoleSelect;
          } else if (this.cursorIndex === 1) {
            this.mode = GameMode.Online;
            this.state = MenuState.OnlineLobby;
            this.onlineError = null;
          } else if (this.cursorIndex === 2) {
            this.state = MenuState.Story;
            resetStoryScene();
          } else {
            this.state = MenuState.Controls;
          }
          this.cursorIndex = 0;
          audioManager.playMenuSelect();
        }
        break;
      }

      case MenuState.Controls:
        if (input.wasPressed('Escape') || input.wasPressed('Space') || input.wasPressed('Enter')) {
          this.state = MenuState.ModeSelect;
          this.cursorIndex = 3;
          audioManager.playMenuMove();
        }
        break;

      case MenuState.Story:
        updateStoryScene(1 / 60);
        if (input.wasPressed('Escape')) {
          this.state = MenuState.ModeSelect;
          this.cursorIndex = 2;
          audioManager.playMenuMove();
        }
        break;

      case MenuState.OnlineLobby:
        if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW') ||
            input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) {
          this.cursorIndex = (this.cursorIndex + 1) % 2;
          audioManager.playMenuMove();
        }
        if (input.wasPressed('Space') || input.wasPressed('Enter')) {
          if (this.cursorIndex === 0) {
            // Create room
            this.onlineRole = 'host';
            this.playerRole = PlayerRole.Survivor;
            this.state = MenuState.OnlineWaiting;
            this.opponentJoined = false;
            this.onCreateRoom?.();
          } else {
            // Join room
            this.state = MenuState.OnlineJoinInput;
            this.roomCodeInput = '';
            this.onlineError = null;
          }
          audioManager.playMenuSelect();
        }
        if (input.wasPressed('Escape')) {
          this.state = MenuState.ModeSelect;
          this.cursorIndex = 0;
          audioManager.playMenuMove();
        }
        break;

      case MenuState.OnlineJoinInput:
        // Text input for room code
        this.handleCodeInput(input);
        if (input.wasPressed('Enter') && this.roomCodeInput.length === 4) {
          this.onlineRole = 'guest';
          this.playerRole = PlayerRole.Killer;
          this.onlineError = null;
          this.onJoinRoom?.(this.roomCodeInput);
          this.state = MenuState.OnlineWaiting;
          audioManager.playMenuSelect();
        }
        if (input.wasPressed('Escape')) {
          this.state = MenuState.OnlineLobby;
          this.cursorIndex = 1;
          audioManager.playMenuMove();
        }
        break;

      case MenuState.OnlineWaiting:
        if (this.opponentJoined && this.onlineRole === 'host') {
          this.state = MenuState.SurvivorSelect;
          this.cursorIndex = 0;
        }
        if (this.opponentJoined && this.onlineRole === 'guest') {
          this.state = MenuState.KillerSelect;
          this.cursorIndex = 0;
        }
        if (input.wasPressed('Escape')) {
          this.state = MenuState.OnlineLobby;
          this.cursorIndex = 0;
          this.onlineRole = null;
          audioManager.playMenuMove();
        }
        break;

      case MenuState.OnlineCharWait:
        // Waiting for opponent's character selection
        if (this.opponentCharDefId) {
          if (this.onlineRole === 'host') {
            const killerDef = KILLER_DEFS.find((d) => d.id === this.opponentCharDefId) || KILLER_DEFS[0];
            this.state = MenuState.Playing;
            audioManager.playMenuSelect();
            return {
              mode: this.mode,
              playerRole: this.playerRole,
              survivorDef: SURVIVOR_DEFS[this.selectedSurvivor],
              killerDef,
            };
          } else {
            const survivorDef = SURVIVOR_DEFS.find((d) => d.id === this.opponentCharDefId) || SURVIVOR_DEFS[0];
            this.state = MenuState.Playing;
            audioManager.playMenuSelect();
            return {
              mode: this.mode,
              playerRole: this.playerRole,
              survivorDef,
              killerDef: KILLER_DEFS[this.selectedKiller],
            };
          }
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
          // CPU対戦: 自分のロールのキャラだけ選択、相手はランダム
          this.state = this.playerRole === PlayerRole.Survivor ? MenuState.SurvivorSelect : MenuState.KillerSelect;
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
          if (this.mode === GameMode.VsCPU) {
            // CPU対戦: キラーはランダム
            this.selectedKiller = Math.floor(Math.random() * KILLER_DEFS.length);
            this.state = MenuState.Playing;
            audioManager.playMenuSelect();
            return {
              mode: this.mode,
              playerRole: this.playerRole,
              survivorDef: SURVIVOR_DEFS[this.selectedSurvivor],
              killerDef: KILLER_DEFS[this.selectedKiller],
            };
          }
          if (this.mode === GameMode.Online) {
            // Online host: survivor selected → send to guest, wait for guest's killer
            this.onCharSelect?.(SURVIVOR_DEFS[this.selectedSurvivor].id);
            this.state = MenuState.OnlineCharWait;
            audioManager.playMenuSelect();
            // Check if opponent already selected
            if (this.opponentCharDefId) {
              const killerDef = KILLER_DEFS.find((d) => d.id === this.opponentCharDefId) || KILLER_DEFS[0];
              this.state = MenuState.Playing;
              return {
                mode: this.mode,
                playerRole: this.playerRole,
                survivorDef: SURVIVOR_DEFS[this.selectedSurvivor],
                killerDef,
              };
            }
            break;
          }
          this.state = MenuState.KillerSelect;
          this.cursorIndex = 0;
          audioManager.playMenuSelect();
        }
        if (input.wasPressed('Escape')) {
          if (this.mode === GameMode.Online) {
            this.state = MenuState.OnlineLobby;
          } else {
            this.state = MenuState.RoleSelect;
          }
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
          if (this.mode === GameMode.VsCPU) {
            // CPU対戦: サバイバーはランダム
            this.selectedSurvivor = Math.floor(Math.random() * SURVIVOR_DEFS.length);
          }
          if (this.mode === GameMode.Online) {
            // Online guest: killer selected → send to host, wait for host's survivor
            this.onCharSelect?.(KILLER_DEFS[this.selectedKiller].id);
            this.state = MenuState.OnlineCharWait;
            audioManager.playMenuSelect();
            // Check if opponent already selected
            if (this.opponentCharDefId) {
              const survivorDef = SURVIVOR_DEFS.find((d) => d.id === this.opponentCharDefId) || SURVIVOR_DEFS[0];
              this.state = MenuState.Playing;
              return {
                mode: this.mode,
                playerRole: this.playerRole,
                survivorDef,
                killerDef: KILLER_DEFS[this.selectedKiller],
              };
            }
            break;
          }
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
          if (this.mode === GameMode.Online) {
            this.state = MenuState.OnlineLobby;
          } else {
            this.state = MenuState.RoleSelect;
          }
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
      case MenuState.Controls:
        this.renderControls(ctx);
        break;
      case MenuState.Story:
        renderStoryScene(ctx);
        break;
      case MenuState.RoleSelect:
        this.renderRoleSelect(ctx);
        break;
      case MenuState.SurvivorSelect:
        this.renderCharSelect(ctx, 'サバイバーを選択', SURVIVOR_DEFS, 'survivor');
        break;
      case MenuState.KillerSelect:
        this.renderCharSelect(ctx, 'キラーを選択', KILLER_DEFS, 'killer');
        break;
      case MenuState.OnlineLobby:
        this.renderOnlineLobby(ctx);
        break;
      case MenuState.OnlineJoinInput:
        this.renderJoinInput(ctx);
        break;
      case MenuState.OnlineWaiting:
        this.renderOnlineWaiting(ctx);
        break;
      case MenuState.OnlineCharWait:
        this.renderCharWait(ctx);
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

    const options = [
      { label: 'CPU 対戦', desc: 'CPUと1対1で対戦' },
      { label: 'オンライン対戦', desc: '他のプレイヤーとオンラインで対戦' },
      { label: 'ストーリー', desc: 'ドットの世界の物語を見る' },
      { label: '操作方法', desc: 'ゲームの操作方法を確認' },
    ];
    for (let i = 0; i < options.length; i++) {
      const y = 200 + i * 70;
      ctx.fillStyle = i === this.cursorIndex ? '#ff2244' : '#666';
      ctx.font = '20px monospace';
      ctx.fillText(options[i].label, CANVAS_WIDTH / 2, y);
      ctx.fillStyle = i === this.cursorIndex ? '#aaa' : '#444';
      ctx.font = '11px monospace';
      ctx.fillText(options[i].desc, CANVAS_WIDTH / 2, y + 25);
      if (i === this.cursorIndex) {
        ctx.fillStyle = '#ff2244';
        ctx.font = '20px monospace';
        ctx.fillText('▶', CANVAS_WIDTH / 2 - 160, y);
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

  private renderCharSelect(ctx: CanvasRenderingContext2D, title: string, defs: CharacterDef[], type: 'survivor' | 'killer'): void {
    const CX = CANVAS_WIDTH / 2;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(title, CX, 80);

    // ── Character list (left side) ──
    const listX = CX - 80;
    for (let i = 0; i < defs.length; i++) {
      const y = 180 + i * 100;
      const selected = i === this.cursorIndex;

      // Character box
      ctx.fillStyle = selected ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(listX - 180, y - 30, 360, 80);

      // Color swatch
      ctx.fillStyle = defs[i].color;
      ctx.fillRect(listX - 160, y - 14, 24, 24);

      // Name
      ctx.fillStyle = selected ? '#fff' : '#888';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(defs[i].nameJp, listX, y);

      // Description
      ctx.fillStyle = selected ? '#aaa' : '#555';
      ctx.font = '11px monospace';
      ctx.fillText(defs[i].description, listX, y + 26);

      if (selected) {
        ctx.fillStyle = '#ff2244';
        ctx.font = '18px monospace';
        ctx.fillText('▶', listX - 200, y + 5);
      }
    }

    // ── Character preview (right side, same frame size as left list) ──
    // Left list box: x = listX-180, w = 360, h = 80 each, y starts at 150
    // Preview box matches: same width/height, positioned to the right
    const boxW = 360, boxH = 80 * defs.length + 20 * (defs.length - 1);
    const boxX = listX - 180 + 360 + 20; // 20px gap from left list
    const boxY = 180 - 30; // same top as first list item
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Animate: cycle direction every 1.5s, walking animation
    const t = Date.now() / 1000;
    const dirCycle = Math.floor(t / 1.5) % 4;
    const dirs: Direction[] = [Direction.Down, Direction.Right, Direction.Up, Direction.Left];

    // Set up preview character
    const scale = 1.8;
    const preview = type === 'survivor' ? this.previewSurvivor : this.previewKiller;
    preview.color = defs[this.cursorIndex].color;
    preview.characterId = defs[this.cursorIndex].id;
    preview.direction = dirs[dirCycle];
    preview.isMoving = true;
    preview.animTime = t * 6;

    // Center character in box
    const boxCX = boxX + boxW / 2;
    const boxCY = boxY + boxH / 2;
    ctx.save();
    ctx.translate(boxCX, boxCY);
    ctx.scale(scale, scale);
    preview.render(ctx, -preview.width / 2, -preview.width / 2);
    ctx.restore();

    // Direction label below character
    const dirLabels: Record<string, string> = {
      down: '▼ 前', up: '▲ 後', left: '◀ 左', right: '▶ 右',
    };
    ctx.fillStyle = '#666';
    ctx.font = '11px monospace';
    ctx.fillText(dirLabels[dirs[dirCycle]], boxCX, boxY + boxH - 10);

    ctx.fillStyle = '#555';
    ctx.font = '12px monospace';
    ctx.fillText('ESC: 戻る　↑↓: 選択　SPACE: 決定', CX, CANVAS_HEIGHT - 60);
    ctx.textAlign = 'left';
  }

  // ─── Online lobby screens ───

  private renderOnlineLobby(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('オンライン対戦', CANVAS_WIDTH / 2, 150);

    ctx.fillStyle = '#aaa';
    ctx.font = '13px monospace';
    ctx.fillText('ホスト = サバイバー / ゲスト = キラー', CANVAS_WIDTH / 2, 190);

    const options = ['部屋を作成 (ホスト)', '部屋に参加 (ゲスト)'];
    for (let i = 0; i < options.length; i++) {
      const y = 270 + i * 70;
      ctx.fillStyle = i === this.cursorIndex ? '#ff2244' : '#666';
      ctx.font = '20px monospace';
      ctx.fillText(options[i], CANVAS_WIDTH / 2, y);
      if (i === this.cursorIndex) {
        ctx.fillText('▶', CANVAS_WIDTH / 2 - 180, y);
      }
    }

    if (this.onlineError) {
      ctx.fillStyle = '#ff4444';
      ctx.font = '14px monospace';
      ctx.fillText(this.onlineError, CANVAS_WIDTH / 2, 440);
    }

    ctx.fillStyle = '#555';
    ctx.font = '12px monospace';
    ctx.fillText('ESC: 戻る　↑↓: 選択　SPACE: 決定', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 60);
    ctx.textAlign = 'left';
  }

  private renderJoinInput(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('ルームコードを入力', CANVAS_WIDTH / 2, 180);

    // Code display
    const code = this.roomCodeInput.padEnd(4, '_');
    ctx.font = 'bold 48px monospace';
    ctx.fillStyle = '#ff8844';
    ctx.letterSpacing = '12px';
    ctx.fillText(code, CANVAS_WIDTH / 2, 300);
    ctx.letterSpacing = '0px';

    // Cursor blink
    if (this.roomCodeInput.length < 4) {
      const blink = Math.sin(Date.now() / 300) > 0;
      if (blink) {
        const charW = 36;
        const startX = CANVAS_WIDTH / 2 - charW * 2 + this.roomCodeInput.length * charW + 6;
        ctx.fillStyle = '#ff8844';
        ctx.fillRect(startX, 310, charW - 4, 3);
      }
    }

    if (this.onlineError) {
      ctx.fillStyle = '#ff4444';
      ctx.font = '14px monospace';
      ctx.fillText(this.onlineError, CANVAS_WIDTH / 2, 380);
    }

    ctx.fillStyle = '#aaa';
    ctx.font = '14px monospace';
    ctx.fillText('4文字のコードを入力してENTERで参加', CANVAS_WIDTH / 2, 420);

    ctx.fillStyle = '#555';
    ctx.font = '12px monospace';
    ctx.fillText('ESC: 戻る　ENTER: 参加', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 60);
    ctx.textAlign = 'left';
  }

  private renderOnlineWaiting(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px monospace';

    if (this.onlineRole === 'host') {
      ctx.fillText('部屋を作成しました', CANVAS_WIDTH / 2, 180);

      // Room code
      ctx.fillStyle = '#ff8844';
      ctx.font = 'bold 56px monospace';
      ctx.letterSpacing = '16px';
      ctx.fillText(this.roomCode, CANVAS_WIDTH / 2, 280);
      ctx.letterSpacing = '0px';

      ctx.fillStyle = '#aaa';
      ctx.font = '14px monospace';
      ctx.fillText('このコードを相手に伝えてください', CANVAS_WIDTH / 2, 330);

      // Waiting animation
      const dots = '.'.repeat(Math.floor(Date.now() / 500) % 4);
      ctx.fillStyle = '#888';
      ctx.font = '18px monospace';
      ctx.fillText(`対戦相手を待っています${dots}`, CANVAS_WIDTH / 2, 400);
    } else {
      ctx.fillText('接続中...', CANVAS_WIDTH / 2, 280);
    }

    if (this.onlineError) {
      ctx.fillStyle = '#ff4444';
      ctx.font = '14px monospace';
      ctx.fillText(this.onlineError, CANVAS_WIDTH / 2, 450);
    }

    ctx.fillStyle = '#555';
    ctx.font = '12px monospace';
    ctx.fillText('ESC: キャンセル', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 60);
    ctx.textAlign = 'left';
  }

  private renderCharWait(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('対戦相手の選択を待っています', CANVAS_WIDTH / 2, 250);

    const dots = '.'.repeat(Math.floor(Date.now() / 500) % 4);
    ctx.fillStyle = '#888';
    ctx.font = '18px monospace';
    ctx.fillText(dots, CANVAS_WIDTH / 2, 300);
    ctx.textAlign = 'left';
  }

  private renderControls(ctx: CanvasRenderingContext2D): void {
    const CX = CANVAS_WIDTH / 2;
    ctx.textAlign = 'center';

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('操作方法', CX, 60);

    // サバイバー操作
    const leftX = CX - 160;
    const rightX = CX + 160;

    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('サバイバー', leftX, 110);

    ctx.font = '13px monospace';
    const survivorControls = [
      ['W A S D', '移動'],
      ['Shift (左)', '歩き (静かに移動)'],
      ['E', 'インタラクト'],
      ['', '(修理 / 板倒し / ロッカー /'],
      ['', ' ゲート開放 / フック脱出)'],
      ['Q', '能力発動'],
      ['Space', '自力脱出 (フック)'],
    ];
    for (let i = 0; i < survivorControls.length; i++) {
      const y = 145 + i * 28;
      const [key, desc] = survivorControls[i];
      if (key) {
        ctx.fillStyle = '#ffcc44';
        ctx.fillText(key, leftX - 60, y);
        ctx.fillStyle = '#bbb';
        ctx.fillText(desc, leftX + 60, y);
      } else {
        ctx.fillStyle = '#bbb';
        ctx.fillText(desc, leftX + 60, y);
      }
    }

    // キラー操作
    ctx.fillStyle = '#ff2244';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('キラー', rightX, 110);

    ctx.font = '13px monospace';
    const killerControls = [
      ['W A S D', '移動'],
      ['Shift (左)', '歩き (静かに移動)'],
      ['E', 'インタラクト'],
      ['', '(攻撃 / 担ぎ / フック吊り /'],
      ['', ' 板破壊 / ロッカー調査)'],
      ['Q', '能力発動'],
    ];
    for (let i = 0; i < killerControls.length; i++) {
      const y = 145 + i * 28;
      const [key, desc] = killerControls[i];
      if (key) {
        ctx.fillStyle = '#ffcc44';
        ctx.fillText(key, rightX - 60, y);
        ctx.fillStyle = '#bbb';
        ctx.fillText(desc, rightX + 60, y);
      } else {
        ctx.fillStyle = '#bbb';
        ctx.fillText(desc, rightX + 60, y);
      }
    }

    // ゲーム概要
    ctx.fillStyle = '#888';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('ゲームの流れ', CX, 380);

    ctx.font = '12px monospace';
    ctx.fillStyle = '#aaa';
    const rules = [
      'サバイバー: 発電機を修理してゲートを通電し、脱出を目指す',
      'キラー: サバイバーを2回攻撃して瀕死にし、フックに吊って処刑する',
      '',
      '・発電機を規定数修理するとゲートが通電する',
      '・通電後、ゲートをインタラクトで開けて脱出すればサバイバーの勝利',
      '・サバイバーをフックに3回吊れば処刑完了でキラーの勝利',
      '・板を倒すとキラーの進路を塞げる (近くにいるとスタン効果)',
      '・ロッカーに隠れてキラーをやり過ごすことも可能',
    ];
    for (let i = 0; i < rules.length; i++) {
      ctx.fillText(rules[i], CX, 410 + i * 22);
    }

    ctx.fillStyle = '#555';
    ctx.font = '12px monospace';
    ctx.fillText('ESC / SPACE: 戻る', CX, CANVAS_HEIGHT - 40);
    ctx.textAlign = 'left';
  }

  /** Handle keyboard input for room code entry */
  private handleCodeInput(input: Input): void {
    if (this.roomCodeInput.length < 4) {
      // Check A-Z and 0-9 keys
      const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      for (const ch of letters) {
        if (input.wasPressed(`Key${ch}`)) {
          this.roomCodeInput += ch;
          audioManager.playMenuMove();
          return;
        }
      }
      for (let d = 2; d <= 9; d++) {
        if (input.wasPressed(`Digit${d}`)) {
          this.roomCodeInput += String(d);
          audioManager.playMenuMove();
          return;
        }
      }
    }
    // Backspace
    if (input.wasPressed('Backspace') && this.roomCodeInput.length > 0) {
      this.roomCodeInput = this.roomCodeInput.slice(0, -1);
      audioManager.playMenuMove();
    }
  }
}
