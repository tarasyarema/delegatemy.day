import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'better-sqlite3',
        '@nut-tree/nut-js',
        '@nut-tree-fork/libnut-darwin',
        'speaker',
        'sharp',
        'sqlite-vec',
        '@picovoice/pvrecorder-node',
        'electron',
      ]
    }
  }
});
