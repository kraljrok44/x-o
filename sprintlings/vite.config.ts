import { defineConfig } from 'vite';

// Build modes select the distribution platform (see src/platform/Platform.ts):
//   development    -> "dev"          `npm run dev`: labelled test-ad simulator, sandbox purchases
//   production     -> "standalone"   `npm run build`: offline build, no ads, no purchases
//   crazygames     -> "crazygames"   CrazyGames HTML5 SDK v3 (ads, data module, gameplay events)
//   gamemonetize   -> "gamemonetize" GameMonetize SDK (interstitials only)
//   web            -> "web"          standalone site talking to our own server (server/)
function platformFor(mode: string): string {
  if (mode === 'crazygames' || mode === 'gamemonetize' || mode === 'web') return mode;
  return mode === 'production' ? 'standalone' : 'dev';
}

export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __PLATFORM__: JSON.stringify(platformFor(mode)),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'es2022',
    outDir: `dist/${platformFor(mode)}`,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2500,
    sourcemap: false,
  },
  server: { host: true, port: 5173 },
}));
