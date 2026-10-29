import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
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
    // Заставка (index.html) показывает настоящий прогресс: вписываем файлы первого экрана
    // и их вес после сжатия — [путь, байты, 1 для картинки героев].
    {
      name: 'splash-files',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler(html, ctx) {
          const bundle = ctx.bundle;
          if (!bundle || !ctx.chunk) return html;
          const files: [string, number, number?][] = [];
          const seen = new Set<string>();
          const add = (name: string) => {
            if (seen.has(name)) return;
            seen.add(name);
            const item = bundle[name];
            if (!item) return;
            const code = item.type === 'chunk' ? item.code : item.source;
            files.push([`/${name}`, gzipSync(code).length]);
            if (item.type === 'chunk') {
              item.imports.forEach(add);
              item.viteMetadata?.importedCss.forEach(add);
            }
          };
          add(ctx.chunk.fileName);
          files.push(['/splash/heroes.webp', readFileSync('public/splash/heroes.webp').length, 1]);
          return html.replace('/*SPLASH_FILES*/[]', JSON.stringify(files));
        },
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
