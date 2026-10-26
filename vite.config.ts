import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { CHANGELOG } from './src/updates/changelog';

// Версия сборки для отчётов об ошибках: короткий хеш коммита и дата.
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'local';
  }
})();
const APP_VERSION = `${commit}-${new Date().toISOString().slice(0, 10)}`;

export default defineConfig({
  plugins: [
    react(),
    // version.json: открытая игра сверяет с ним свою версию и показывает «Что нового» (src/updates).
    {
      name: 'version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION, changelog: CHANGELOG.slice(0, 10) }) });
      },
    },
  ],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  server: {
    host: true,
    // Сервер матчей в разработке: npm run dev:server
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true }, '/api': 'http://localhost:8787' },
  },
  preview: {
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true }, '/api': 'http://localhost:8787' },
  },
});
