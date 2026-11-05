import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const shared = { bundle: true, platform: 'node', target: 'node22', format: 'cjs', define: { 'import.meta.env.BASE_URL': '"/"' } };
await Promise.all([
  build({ ...shared, entryPoints: ['server/index.ts'], external: ['bufferutil', 'utf-8-validate'], outfile: 'dist-server/server.cjs' }),
  build({ ...shared, entryPoints: ['server/habitIndex.ts'], outfile: 'dist-server/habit.cjs' }),
]);
mkdirSync('dist-server/media', { recursive: true });
cpSync('public/bot/welcome.jpg', 'dist-server/welcome.jpg');
cpSync('server/media/channel', 'dist-server/media/channel', { recursive: true });
cpSync('public/emoji', 'dist-server/media/emoji', { recursive: true });
