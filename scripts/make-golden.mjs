// Regenerates tests/golden/prqlite.golden.json by running tests/golden/corpus.sql through the
// real PRQLite REPL, compiled fresh into a temp directory (so its data/ starts empty).
//
//   node scripts/make-golden.mjs [path-to-PRQLite]      # default: ../PRQLite
import { execFileSync, spawnSync } from 'node:child_process';
import { globSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(process.argv[2] ?? '../PRQLite');
const work = mkdtempSync(join(tmpdir(), 'prqlite-golden-'));
const bin = join(work, 'prqlite');

const sources = globSync('src/**/*.cpp', { cwd: repo });
execFileSync('c++', ['-std=c++17', '-O1', '-w', '-I.', '-Iinclude', `-DPROJECT_ROOT="${work}"`, ...sources, '-o', bin], {
  cwd: repo,
  stdio: 'inherit',
});
const commit = execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();

const statements = readFileSync('tests/golden/corpus.sql', 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('--'));

// stderr is merged so "Error: ..." lines stay in order with the rows around them.
const run = spawnSync('sh', ['-c', `"${bin}" 2>&1`], {
  cwd: work,
  input: [...statements, 'exit', ''].join('\n'),
  encoding: 'utf8',
});

// The REPL prints "db> " before reading each line, so part i+1 is the output of line i.
const parts = run.stdout.split('db> ');
if (parts.length !== statements.length + 2) {
  throw new Error(`expected ${statements.length + 2} prompt-delimited parts, got ${parts.length}`);
}

const cases = statements.map((sql, i) => ({ sql, output: parts[i + 1] }));
writeFileSync('tests/golden/prqlite.golden.json', `${JSON.stringify({ source: `PRQLite@${commit}`, cases }, null, 2)}\n`);
console.log(`wrote ${cases.length} cases from PRQLite@${commit}`);
