// Generates the phone remote's cards.json from src/present/steps.ts so the
// phone and the in-app Present mode never drift apart.
// Usage (from frontend/): node scripts/gen-phone-cards.mjs [outPath]
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, '../src/present/steps.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { STEPS } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const cards = STEPS.map((step, i) => ({
  n: i + 1,
  id: step.id,
  kind: step.kind,
  title: step.title,
  points: step.supportNotes,
}));
const out = process.argv[2] ?? path.join(homedir(), '.claude/skills/phone-remote/app/cards.json');
writeFileSync(out, JSON.stringify({ title: 'TrendTrace', talkMinutes: 5, cards }, null, 2) + '\n', 'utf8');
console.log(`wrote ${cards.length} cards to ${out}`);
