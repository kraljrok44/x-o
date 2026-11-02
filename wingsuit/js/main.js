// Entry point: platform init, save load, game boot and main loop.
import { platform } from './platform.js';
import { save } from './save.js';
import { Game } from './game.js';

async function boot() {
  const bar = document.getElementById('loadBar');
  bar.style.width = '5%';
  await platform.init();
  platform.loadingStart();
  save.load();
  const game = new Game(document.getElementById('c'));
  window.__game = game;
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    try { game.frame(dt); } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  platform.loadingStop();
  // New players go straight into their first flight (max one click to jump).
  if (save.isNew || !save.data.tutorialDone) await game.startSession({ missionId: 'm1' });
  else await game.showMenu();
}

boot().catch((e) => {
  console.error(e);
  const t = document.getElementById('loadText');
  if (t) t.textContent = 'Sorry, your browser could not start the game (WebGL required).';
});
