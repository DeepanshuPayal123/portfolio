// Keeps only the live production deployment of the Pages project; every older deployment,
// with its per-deployment URL (<hash>.deepanshupayal.pages.dev), is deleted.
// Cloudflare lists deployments newest first; the newest is never touched, and the result is
// re-checked afterwards so a silent no-op fails loudly instead of claiming success.
//
//   node scripts/prune-deployments.mjs
import { execFileSync } from 'node:child_process';

const PROJECT = 'deepanshupayal';

const wrangler = (...args) =>
  execFileSync('npx', ['wrangler', 'pages', 'deployment', ...args, '--project-name', PROJECT], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

const list = (environment) => JSON.parse(wrangler('list', '--environment', environment, '--json'));

const [live, ...olderProduction] = list('production');
if (!live) throw new Error('no production deployment found — refusing to prune');
const stale = [...olderProduction, ...list('preview')];

for (const deployment of stale) {
  // --force skips the confirmation prompt, which non-interactive runs silently answer "no".
  const output = wrangler('delete', deployment.Id, '--force');
  if (!output.includes('Successfully deleted')) throw new Error(`delete of ${deployment.Id} did not happen:\n${output}`);
  console.log(`deleted ${deployment.Id} (${deployment.Deployment})`);
}

const remaining = [...list('production'), ...list('preview')].map((d) => d.Id);
if (remaining.length !== 1 || remaining[0] !== live.Id) {
  throw new Error(`expected only ${live.Id} to remain, found: ${remaining.join(', ')}`);
}
console.log(`kept ${live.Id}; deleted ${stale.length}`);
