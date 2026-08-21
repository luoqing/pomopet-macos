import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'src/ui',
  base: './',
  build: {
    outDir: '../../dist/app',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        control: resolve(import.meta.dirname, 'src/ui/index.html'),
        pet: resolve(import.meta.dirname, 'src/ui/pet.html')
      }
    }
  }
});
