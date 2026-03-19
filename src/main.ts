import { Game } from './core/Game';
import { GameLoop } from './core/GameLoop';
import { Input } from './core/Input';
import { Menu, MenuState, MenuSelection } from './ui/Menu';
import { GamePhase } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';
import { audioManager } from './audio/AudioManager';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
const ctx = canvas.getContext('2d')!;

const input = new Input();
const menu = new Menu();
let game: Game | null = null;

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

const loop = new GameLoop(
  (dt) => {
    if (game) {
      game.update(dt);
      if (game.phase !== GamePhase.Playing && input.wasPressed('KeyR')) {
        audioManager.stopHeartbeat();
        audioManager.stopAmbient();
        audioManager.stopChase();
        game.infoPanel.hide();
        game = new Game(canvas, input, game.selection);
        audioManager.startAmbient();
      }
      if (input.wasPressed('Escape') && game.phase !== GamePhase.Playing) {
        audioManager.stopHeartbeat();
        audioManager.stopAmbient();
        audioManager.stopChase();
        game.infoPanel.hide();
        game = null;
        menu.state = MenuState.Title;
        audioManager.startMenuBGM();
        audioManager.startCampfire();
      }
    } else {
      const selection = menu.update(input);
      if (selection) {
        audioManager.stopMenuBGM();
        audioManager.stopCampfire();
        game = new Game(canvas, input, selection);
        audioManager.startAmbient();
      }
    }
    input.endFrame();
  },
  (_alpha) => {
    if (game) {
      game.render(_alpha);
    } else {
      menu.render(ctx);
    }
  },
);

loop.start();
