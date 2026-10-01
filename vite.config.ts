import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { llmApi } from './server/llm/vite-plugin.ts';

export default defineConfig({
  plugins: [react(), llmApi()],
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
  },
});
