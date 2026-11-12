import { createGame } from './core/game';
import { saveManager } from './save/SaveManager';

// Load the saved game (profile, settings, key bindings) before any scene starts, then keep it saved.
saveManager.load();
saveManager.start();
createGame('game');
