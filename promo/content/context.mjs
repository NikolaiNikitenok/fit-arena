// Produce exactly the prompt and validation used by the render workflow.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { QUALITY_BRIEF } from './protocol.mjs';

const [mode, workflow, number, kind, topic = '', input, output] = process.argv.slice(2);
const n = Number(number);
if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid issue number');
const names = { 'reel.yml': kind === 'loop' ? '../reels/loop/generate.mjs' : '../reels/generate.mjs',
  'carousel.yml': '../carousel/generate.mjs', 'talk.yml': '../talk/generate.mjs' };
if (!names[workflow]) throw new Error('Unsupported content workflow');
process.argv = [process.execPath, fileURLToPath(import.meta.url), String(n), ...(workflow === 'carousel.yml' ? [kind || 'tips', topic] : [topic])];
const generator = await import(names[workflow]);
const cast = workflow === 'talk.yml' ? generator.pick(n) : null;
if (mode === 'prompt') {
  const prompt = (cast ? generator.prompt(cast) : generator.prompt()) + QUALITY_BRIEF;
  writeFileSync(output || input || 'prompt.txt', prompt);
} else if (mode === 'validate') {
  const candidate = JSON.parse(readFileSync(input, 'utf8'));
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('Expected a script object');
  const problems = cast ? generator.problems(candidate, cast) : generator.problems(candidate);
  if (problems.length) throw new Error(problems.join('; '));
  if (kind !== 'story' && (!candidate.caption || !Array.isArray(candidate.hashtags))) throw new Error('Caption and hashtags are required');
  if (candidate.lines) for (const line of candidate.lines) if (line.say) line.say = line.say.replace(/Никитенок/g, 'Никитёнок');
  const metadata = { n, topic, provider: 'codex-local' };
  if (cast) Object.assign(metadata, cast, { cast: { [cast.host]: generator.CAST[cast.host], [cast.guest]: generator.CAST[cast.guest] } });
  if (workflow === 'carousel.yml') metadata.kind = kind || 'tips';
  if (kind === 'loop') metadata.loop = true;
  writeFileSync(output, JSON.stringify({ ...candidate, ...metadata }, null, 2));
} else throw new Error('Use prompt or validate');
