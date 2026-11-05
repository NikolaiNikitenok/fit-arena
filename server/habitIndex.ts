/** Independent Freedom backend. Its restart/deploy does not interrupt Arena matches. */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FamilyHabits } from './family';
import { habitApi, HabitLinks, HabitStore } from './habit';
import { NidRevocations } from './nidRevocations';

const dir = process.env.HABIT_DATA_DIR ?? '/opt/nikitenok-habit/data';
const secret = process.env.NID_HABIT_SECRET || readFileSync(process.env.NID_HABIT_SECRET_FILE ?? '/opt/arena-server/.nid-habit-secret', 'utf8').trim();
const cfg = { internal: process.env.NID_INTERNAL ?? 'http://127.0.0.1:8096', issuer: process.env.NID_ISSUER ?? 'https://id.nikitenok.ru',
  clientId: 'habit', secret, redirectUri: 'https://habit.nikitenok.ru/' };
const revocations = new NidRevocations(cfg);
const store = new HabitStore(join(dir, 'habit.json'));
const links = new HabitLinks(join(dir, 'habit-nid.json'));
const family = new FamilyHabits();
const nid = { cfg: { ...cfg, sessionValid: (id: string, version: number) => revocations.accepts(id, version) }, links };
const server = http.createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path === '/health') return void res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
  if (!path.startsWith('/api/habit/')) return void res.writeHead(404).end();
  void habitApi(path, req, res, store, process.env.FAMILY_WEBHOOK_SECRET ?? '', (sum) => {
    if (!sum.pid.startsWith('nid:')) family.push(sum);
  }, Date.now, nid).catch((error) => {
    console.error('habit request', error);
    if (!res.headersSent) res.writeHead(500).end();
  });
});
server.listen(Number(process.env.PORT ?? 8790), '127.0.0.1', () => console.log('nikitenok-habit ready'));
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => {
  store.flush(); revocations.close(); server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
});
