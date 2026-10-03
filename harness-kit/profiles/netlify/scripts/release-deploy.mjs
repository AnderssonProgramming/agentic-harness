// The release skill's only door to Netlify. Runs the project's own netlify-cli without a shell, so
// JSON arguments survive on Windows and no `npx` (which may download packages) is involved.
// It never reads or prints credentials: login is the PO's one-time `netlify login`.
//   npm run -s release:deploy -- status             → {loggedIn, linked, siteId, siteUrl, publishedDeployId}
//   npm run -s release:deploy -- draft "<message>"  → {deployId, deployUrl}   (builds, then a draft deploy)
//   npm run -s release:deploy -- publish <deployId> → {published, deployId, siteUrl}
// Always prints one JSON object; exits 1 on failure with {error}.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('netlify-cli/package.json')), 'bin', 'run.js');

const netlify = (args) =>
  execFileSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
// The CLI may print log lines before its JSON; take the first top-level JSON object.
const json = (text) => JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
const done = (value, code = 0) => {
  console.log(JSON.stringify(value, null, 2));
  process.exit(code);
};

// `status --json` exits non-zero when logged out or unlinked, but still prints its JSON.
const statusJson = () => {
  try {
    return json(netlify(['status', '--json']));
  } catch (error) {
    return json(String(error.stdout ?? ''));
  }
};

const status = () => {
  const s = statusJson();
  if (!s.loggedIn || !s.linked) {
    return { loggedIn: Boolean(s.loggedIn), linked: Boolean(s.linked), fix: s.error?.fix ?? null };
  }
  const siteId = s.siteData?.['site-id'] ?? s.siteData?.id;
  const site = json(netlify(['api', 'getSite', '--data', JSON.stringify({ site_id: siteId })]));
  return {
    loggedIn: true,
    linked: true,
    siteId,
    siteName: site.name,
    siteUrl: site.ssl_url ?? site.url,
    publishedDeployId: site.published_deploy?.id ?? null,
  };
};

const [command, arg] = process.argv.slice(2);
try {
  if (command === 'status') done(status());
  if (command === 'draft') {
    const deploy = json(netlify(['deploy', '--json', '--message', arg ?? 'draft']));
    done({ deployId: deploy.deploy_id, deployUrl: deploy.deploy_url });
  }
  if (command === 'publish') {
    if (!arg) done({ error: 'publish needs a deploy id' }, 1);
    const s = status();
    if (!s.linked) done({ error: 'not logged in or not linked', ...s }, 1);
    netlify([
      'api',
      'restoreSiteDeploy',
      '--data',
      JSON.stringify({ site_id: s.siteId, deploy_id: arg }),
    ]);
    const after = status();
    done(
      { published: after.publishedDeployId === arg, deployId: arg, siteUrl: after.siteUrl },
      after.publishedDeployId === arg ? 0 : 1,
    );
  }
  done({ error: `unknown command "${String(command)}"; use status, draft or publish` }, 2);
} catch (error) {
  const stderr = String(error.stderr ?? '')
    .trim()
    .split('\n')
    .slice(-5)
    .join('\n');
  done({ error: String(error.message).split('\n')[0], stderr }, 1);
}
