import { Game } from './core/Game';
import { GameLoop } from './core/GameLoop';
import { Input } from './core/Input';
import { Menu, MenuState, GameMode } from './ui/Menu';
import { GamePhase } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';
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

menu.onCreateRoom = async () => {
  try {
    netClient = new NetworkClient();
    await netClient.connect();
    netClient.createRoom();
    netClient.onMessage((msg) => {
      if (msg.type === 'room_created') {
        menu.roomCode = msg.code;
      }
      if (msg.type === 'opponent_joined') {
        menu.opponentJoined = true;
      }
      if (msg.type === 'relay' && msg.data?.type === 'char_select') {
        menu.opponentCharDefId = msg.data.defId;
      }
      if (msg.type === 'error') {
        menu.onlineError = msg.message;
      }
      if (msg.type === 'opponent_left' && !game) {
        menu.onlineError = '相手が切断しました';
        menu.state = MenuState.OnlineLobby;
      }
    });
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
    netClient.onMessage((msg) => {
      if (msg.type === 'joined') {
        menu.opponentJoined = true;
        menu.roomCode = code;
      }
      if (msg.type === 'relay' && msg.data?.type === 'char_select') {
        menu.opponentCharDefId = msg.data.defId;
      }
      if (msg.type === 'error') {
        menu.onlineError = msg.message;
        menu.state = MenuState.OnlineJoinInput;
      }
      if (msg.type === 'opponent_left' && !game) {
        menu.onlineError = '相手が切断しました';
        menu.state = MenuState.OnlineLobby;
      }
    });
  } catch {
    menu.onlineError = 'サーバーに接続できません';
    menu.state = MenuState.OnlineJoinInput;
  }
};

// Send char_select via relay
menu.onCharSelect = (defId: string) => {
  if (netClient) {
    netClient.relay({ type: 'char_select', defId });
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
}

function returnToMenu(): void {
  audioManager.stopHeartbeat();
  audioManager.stopAmbient();
  audioManager.stopChase();
  if (game) game.infoPanel.hide();
  game = null;
  if (onlineGame) cleanupOnline();
  menu.state = MenuState.Title;
  audioManager.startMenuBGM();
  audioManager.startCampfire();
}

// ─── Game loop ───

const loop = new GameLoop(
  (dt) => {
    if (game) {
      if (onlineGame) {
        // Online mode
        onlineGame.update(dt);
        if (menu.onlineRole === 'guest') {
          onlineGame.sendInput(input);
        }
      } else {
        // Local mode
        game.update(dt);
      }

      // Restart
      if (game.phase !== GamePhase.Playing && input.wasPressed('KeyR')) {
        if (onlineGame) {
          // No restart in online mode
        } else {
          audioManager.stopHeartbeat();
          audioManager.stopAmbient();
          audioManager.stopChase();
          game.infoPanel.hide();
          game = new Game(canvas, input, game.selection);
          audioManager.startAmbient();
        }
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

        if (selection.mode === GameMode.Online && netClient) {
          // Online game
          const isHost = menu.onlineRole === 'host';
          onlineGame = new OnlineGame(canvas, input, selection, netClient, isHost);
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
    } else {
      menu.render(ctx);
    }
  },
);

loop.start();
