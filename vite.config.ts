import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // Phaser is ~1.2 MB; it lives in its own chunk so a game update does not make players download it again.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/phaser')) return 'phaser';
          return undefined;
        },
      },
    },
  },
});
