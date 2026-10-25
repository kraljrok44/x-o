import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-700.css';
import '@fontsource/fredoka/latin-ext-500.css';
import '@fontsource/fredoka/latin-ext-700.css';
import './ui/styles.css';
import { Application } from './app/Application';
import { checkSupport, showFatal } from './app/GameBootstrap';

const root = document.getElementById('app')!;

// Keep portals' iframes from scrolling on arrow keys / space even before the game has focus.
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && !(e.target instanceof HTMLInputElement)) e.preventDefault();
});

if (checkSupport()) {
  const app = new Application(root);
  app.boot().catch((err: unknown) => {
    console.error(err);
    showFatal('Something went wrong', 'The game could not start. Please reload the page.', err instanceof Error ? err.message : String(err));
  });
  (window as unknown as { sprintlings?: Application }).sprintlings = app;
}
