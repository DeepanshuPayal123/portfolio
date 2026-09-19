// Keeps only the live production deployment of the Pages project; every older deployment,
// with its per-deployment URL (<hash>.deepanshupayal.pages.dev), is deleted.
// Cloudflare lists deployments newest first, and refuses to delete the live one, so a wrong
// guess fails loudly instead of taking the site down.
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
const stale = [...olderProduction, ...list('preview')];

for (const deployment of stale) {
  wrangler('delete', deployment.Id);
  console.log(`deleted ${deployment.Id} (${deployment.Deployment})`);
}
console.log(`kept ${live?.Id ?? 'nothing'}; deleted ${stale.length}`);
