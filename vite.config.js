import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    coverage: {
      provider: 'istanbul',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/test/**'],
      reporter: ['text', 'json', 'lcov', 'html'],
    },
  },
});
