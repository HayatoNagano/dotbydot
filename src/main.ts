import { Game } from './core/Game';
import { GameLoop } from './core/GameLoop';
import { Input } from './core/Input';
import { Menu, MenuState, GameMode } from './ui/Menu';
import { GamePhase } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GAME_HEIGHT } from './constants';
import { audioManager } from './audio/AudioManager';
import { NetworkClient } from './net/NetworkClient';
import { OnlineGame } from './net/OnlineGame';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
const ctx = canvas.getContext('2d')!;

const input = new Input();
const menu = new Menu();
let game: Game | null = null;
let onlineGame: OnlineGame | null = null;
let netClient: NetworkClient | null = null;

/** Set when a disconnect is detected during online gameplay */
let disconnectMessage: string | null = null;

// Initialize audio on first user interaction
const initAudio = () => {
  audioManager.init();
  audioManager.startMenuBGM();
  audioManager.startCampfire();
  window.removeEventListener('keydown', initAudio);
  window.removeEventListener('click', initAudio);
};
window.addEventListener('keydown', initAudio);
window.addEventListener('click', initAudio);

// ─── Online callbacks ───

/** Shared message handler for online mode (both create & join) */
function setupNetListeners(): void {
  if (!netClient) return;
  netClient.onMessage((msg) => {
    switch (msg.type) {
      case 'room_created':
        menu.roomCode = msg.code;
        break;
      case 'joined':
        menu.opponentJoined = true;
        break;
      case 'player_joined':
        menu.playerCount = msg.playerCount;
        break;
      case 'player_left':
        menu.playerCount = msg.playerCount;
        menu.charSelectedRoles.delete(msg.role);
        break;
      case 'player_count':
        menu.playerCount = msg.playerCount;
        break;
      case 'char_select':
        menu.opponentCharDefId = String(msg.defId);
        menu.charSelectedRoles.add(msg.role);
        break;
      case 'game_start':
        // Server started the game — trigger game creation
        menu.gameStarted = true;
        menu.serverGameStart = msg;
        break;
      case 'error':
        menu.onlineError = msg.message;
        break;
      case 'opponent_left':
        if (game) {
          disconnectMessage = 'プレイヤーが切断しました';
        } else {
          menu.onlineError = 'プレイヤーが切断しました';
        }
        break;
    }
  });
}

menu.onCreateRoom = async () => {
  try {
    netClient = new NetworkClient();
    await netClient.connect();
    netClient.createRoom('killer');
    setupNetListeners();
  } catch {
    menu.onlineError = 'サーバーに接続できません';
    menu.state = MenuState.OnlineLobby;
  }
};

menu.onJoinRoom = async (code: string) => {
  try {
    netClient = new NetworkClient();
    await netClient.connect();
    netClient.joinRoom(code);
    setupNetListeners();
  } catch {
    menu.onlineError = 'サーバーに接続できません';
    menu.state = MenuState.OnlineJoinInput;
  }
};

// Host starts the game — send to server
menu.onStartGame = () => {
  if (netClient) {
    netClient.sendDirect({ type: 'start_game' });
  }
};

// Send char_select directly
menu.onCharSelect = (defId: string) => {
  if (netClient) {
    netClient.sendDirect({ type: 'char_select', defId });
    // Track own selection
    if (netClient.myRole) {
      menu.charSelectedRoles.add(netClient.myRole);
    }
  }
};

function cleanupOnline(): void {
  if (onlineGame) {
    onlineGame.destroy();
    onlineGame = null;
  }
  if (netClient) {
    netClient.disconnect();
    netClient = null;
  }
  menu.opponentJoined = false;
  menu.onlineRole = null;
  menu.roomCode = '';
  menu.onlineError = null;
  menu.opponentCharDefId = null;
  menu.playerCount = 1;
  menu.guestIndex = 0;
  menu.gameStarted = false;
  menu.serverGameStart = null;
  menu.charSelectedRoles.clear();
}

function returnToMenu(): void {
  audioManager.stopHeartbeat();
  audioManager.stopAmbient();
  audioManager.stopChase();
  if (game) game.infoPanel?.hide();
  game = null;
  disconnectMessage = null;
  if (onlineGame) cleanupOnline();
  menu.state = MenuState.Title;
  audioManager.startMenuBGM();
  audioManager.startCampfire();
}

/** Render the disconnect error overlay */
function renderDisconnectScreen(): void {
  // Dark overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, GAME_HEIGHT);

  // Red border frame
  ctx.strokeStyle = '#ff2244';
  ctx.lineWidth = 2;
  const bx = CANVAS_WIDTH / 2 - 180;
  const by = GAME_HEIGHT / 2 - 80;
  const bw = 360;
  const bh = 160;
  ctx.strokeRect(bx, by, bw, bh);

  // Inner background
  ctx.fillStyle = 'rgba(30, 0, 8, 0.95)';
  ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);

  // Warning icon
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff2244';
  ctx.fillText('⚠', CANVAS_WIDTH / 2, by + 30);

  // Title
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#ff4466';
  ctx.fillText('接続が切断されました', CANVAS_WIDTH / 2, by + 58);

  // Message
  ctx.font = '13px monospace';
  ctx.fillStyle = '#ccc';
  ctx.fillText(disconnectMessage ?? '通信エラー', CANVAS_WIDTH / 2, by + 86);

  // Instruction
  ctx.font = '12px monospace';
  ctx.fillStyle = '#888';
  ctx.fillText('ESC キーでメニューに戻る', CANVAS_WIDTH / 2, by + 120);

  // Pulsing border effect
  const pulse = Math.sin(Date.now() / 500) * 0.3 + 0.7;
  ctx.strokeStyle = `rgba(255, 34, 68, ${pulse})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(bx - 3, by - 3, bw + 6, bh + 6);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ─── Game loop ───

const loop = new GameLoop(
  (dt) => {
    if (game) {
      // Disconnect detected — freeze game, wait for ESC
      if (disconnectMessage) {
        if (input.wasPressed('Escape')) {
          returnToMenu();
        }
        input.endFrame();
        return;
      }

      if (onlineGame) {
        // Check WebSocket connection loss
        if (netClient && !netClient.connected && !disconnectMessage) {
          disconnectMessage = '接続が失われました';
          input.endFrame();
          return;
        }
        // All clients send input and run prediction
        onlineGame.sendInput(input, dt);
        onlineGame.update(dt);
      } else {
        // Local mode
        game.update(dt);
      }

      // Return to menu
      if (input.wasPressed('Escape') && game.phase !== GamePhase.Playing) {
        returnToMenu();
      }
    } else {
      const selection = menu.update(input);
      if (selection) {
        audioManager.stopMenuBGM();
        audioManager.stopCampfire();

        if (selection.mode === GameMode.Online && netClient && netClient.myRole) {
          // Online game — all players are equal clients
          onlineGame = new OnlineGame(canvas, input, selection, netClient, netClient.myRole);
          game = onlineGame.game;
          audioManager.startAmbient();
        } else {
          // Local game
          game = new Game(canvas, input, selection);
          audioManager.startAmbient();
        }
      }
    }
    input.endFrame();
  },
  (_alpha) => {
    if (game) {
      if (onlineGame) {
        onlineGame.render(_alpha);
      } else {
        game.render(_alpha);
      }
      // Render disconnect overlay on top of frozen game
      if (disconnectMessage) {
        renderDisconnectScreen();
      }
    } else {
      menu.render(ctx);
    }
  },
);

loop.start();
