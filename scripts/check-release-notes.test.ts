import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateReleaseNotes } from './check-release-notes.mjs';

const script = fileURLToPath(new URL('./check-release-notes.mjs', import.meta.url));
const entry = (n: number, title = "t('Обновление игры')", items = "t('Теперь запуск камеры понятнее.')") => `{
    n: ${n},
    date: '2026-11-05',
    title: ${title},
    items: [${items}],
  },`;
const source = (...entries: string[]) => `import { t } from '../i18n';
export const CHANGELOG: ChangeEntry[] = [
  ${entries.join('\n  ')}
];
`;
const base = source(entry(39));
let dir: string;
let sha: string;
let notesPath: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'arena-release-notes-'));
  notesPath = join(dir, 'src', 'updates', 'changelog.ts');
  mkdirSync(dirname(notesPath), { recursive: true });
  writeFileSync(notesPath, base);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '--quiet');
  git('add', 'src/updates/changelog.ts');
  git('-c', 'user.name=Release fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Fixture base');
  sha = git('rev-parse', 'HEAD').trim();
});
afterAll(() => {
  if (!dir || !resolve(dir).startsWith(resolve(tmpdir(), 'arena-release-notes-'))) throw new Error('Unexpected fixture path');
  rmSync(dir, { recursive: true, force: true });
});

const run = (current: string, baseSha = sha) => {
  writeFileSync(notesPath, current);
  return spawnSync(process.execPath, [script], { cwd: dir, env: { ...process.env, RELEASE_BASE_SHA: baseSha }, encoding: 'utf8' });
};

describe('production push release notes preflight (real git base and CLI)', () => {
  it('accepts a new numbered player-facing entry without installing dependencies', () => {
    const result = run(source(entry(40), entry(39)));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('n=40');
  });

  it('rejects a push with no release notes even if other files changed', () => {
    writeFileSync(join(dir, 'game.ts'), 'export const improved = true;');
    const result = run(base);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Every production push needs a new CHANGELOG entry');
  });

  it.each([39, 38])('rejects editing existing notes without advancing latest n (%i)', (n) => {
    const result = run(source(entry(n, "t('Изменили старую запись')")));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('n greater');
  });

  it.each([
    ['empty title', "t('  ')", "t('Новое поведение')"],
    ['empty items', "t('Обновление')", ''],
    ['empty item', "t('Обновление')", "t('Первая строка'), t('  ')"],
    ['dynamic title', 'someVariable', "t('Новое поведение')"],
    ['dynamic item', "t('Обновление')", 'someVariable'],
    ['escaped whitespace', "t('\\u0020\\t')", "t('Новое поведение')"],
  ])('rejects %s rather than accepting a number-only bump', (_case, title, items) => {
    const result = run(source(entry(40, title, items), entry(39)));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/nonempty translated/);
  });

  it.each(['', '0'.repeat(40), 'bad-sha; echo SHOULD_NOT_RUN', 'f'.repeat(40)])('fails closed for invalid or unavailable base: %s', (baseSha) => {
    const result = run(source(entry(40)), baseSha);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/workflow_dispatch/);
    expect(result.stderr).not.toContain('SHOULD_NOT_RUN');
    expect(result.stdout).not.toContain('SHOULD_NOT_RUN');
  });

  it('validates first release entry rather than finding a high n in older entries', () => {
    expect(() => validateReleaseNotes(base, source(entry(39), entry(999)))).toThrow(/n greater/);
  });

  it('supports punctuation, quoted text and brackets inside translated messages', () => {
    const current = source(entry(40, 't("Что нового: герой и камера")', "t('Нажми \\'Начать\\' [камера] и встань в кадр.'), t(\"Есть подсказки, повторы и награда.\")"), entry(39));
    expect(run(current).status).toBe(0);
  });

  it('push-only preflight precedes npm ci and leaves explicit rollback dispatch available', () => {
    const workflow = readFileSync(fileURLToPath(new URL('../.github/workflows/deploy.yml', import.meta.url)), 'utf8');
    const preflight = workflow.indexOf('- name: Check player release notes');
    expect(preflight).toBeGreaterThan(0);
    expect(preflight).toBeLessThan(workflow.indexOf('- run: npm ci'));
    expect(workflow.slice(preflight, workflow.indexOf('- run: npm ci'))).toContain("if: github.event_name == 'push'");
    expect(workflow).toContain('RELEASE_BASE_SHA: ${{ github.event.before }}');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('continue-on-error:');
  });
});
