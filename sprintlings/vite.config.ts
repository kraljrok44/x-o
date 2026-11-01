import { defineConfig } from 'vite';

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
