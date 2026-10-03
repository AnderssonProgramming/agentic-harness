// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { childEnv, refusal, secretNamesFrom, serveArgs } from './serve-prod-env.mjs';

const root = resolve(import.meta.dirname, '..');
const secrets = secretNamesFrom(readFileSync(join(root, '.env.example'), 'utf8'));
// Real-looking, never real: built at runtime so no key-shaped literal sits in the repo.
const FAKE_KEY = ['sk', 'ant', 'api03', 'x'.repeat(40)].join('-');

const parentEnvs = [
  {},
  { PATH: '/usr/bin' },
  { ANTHROPIC_API_KEY: FAKE_KEY },
  { anthropic_api_key: FAKE_KEY, Path: 'C:\\Windows' },
  { ANTHROPIC_API_KEY: FAKE_KEY, INFERENCE_ENGINE: 'anthropic' },
  { inference_engine: 'ollama', OPENAI_API_KEY: FAKE_KEY, NETLIFY_AUTH_TOKEN: 'tok' },
  { DEBUG: '*', ANTHROPIC_API_KEY: FAKE_KEY },
  { NODE_DEBUG: 'http' },
  { DEBUG: '' },
];
const argLists = [
  [],
  ['--port', '8888'],
  ['--port=8888', '--functions-port', '9999'],
  ['--debug'],
  ['--port', '8888', '--debug'],
  ['DEBUG=*'],
  [`ANTHROPIC_API_KEY=${FAKE_KEY}`],
  [`--ANTHROPIC_API_KEY=${FAKE_KEY}`],
  ['--auth', 'tok'],
  ['--context', 'production'],
  ['--port'],
  [FAKE_KEY],
];

describe('serve:prod child environment (Amendment 2 invariant)', () => {
  it('reads ANTHROPIC_API_KEY as a secret name from .env.example', () => {
    expect(secrets).toContain('ANTHROPIC_API_KEY');
  });

  it('never hands netlify serve a non-empty secret, a debug variable or another engine', () => {
    let started = 0;
    for (const parentEnv of parentEnvs) {
      for (const args of argLists) {
        if (refusal(args, parentEnv) !== null) continue;
        started += 1;
        const env = childEnv(parentEnv, secrets);
        const forwarded = serveArgs(args).join(' ');
        expect(env.ANTHROPIC_API_KEY).toBe('');
        expect(env.INFERENCE_ENGINE).toBe('mock');
        for (const [name, value] of Object.entries(env)) {
          if (/KEY|TOKEN|SECRET|PASSWORD/i.test(name)) expect(value, name).toBe('');
          expect(name).not.toMatch(/^(NODE_)?DEBUG$/i);
          if (/^INFERENCE_ENGINE$/i.test(name)) expect(name).toBe('INFERENCE_ENGINE');
          expect(value).not.toContain(FAKE_KEY);
        }
        expect(forwarded).not.toMatch(/debug|KEY|TOKEN|auth/i);
        expect(forwarded).not.toContain(FAKE_KEY);
      }
    }
    // The property is only meaningful if some combinations actually start.
    expect(started).toBeGreaterThan(10);
  });

  it.each([
    [['--debug'], {}],
    [['--port', '8888', '--debug'], {}],
    [['DEBUG=*'], {}],
    [[`ANTHROPIC_API_KEY=${FAKE_KEY}`], {}],
    [['--auth', 'tok'], {}],
    [[], { DEBUG: '*' }],
    [[], { NODE_DEBUG: 'http' }],
  ])('refuses %j with env %j', (args, env) => {
    expect(refusal(args, env)).toMatch(/refused|Unset/);
  });

  it('`serve:prod -- --debug` exits non-zero without starting', () => {
    const run = spawnSync(process.execPath, ['scripts/serve-prod.mjs', '--debug'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 15_000,
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('"--debug" is refused');
    // netlify serve's first line would announce the build; nothing ran.
    expect(run.stdout).toBe('');
  });

  it('refuses DEBUG=* from the environment without starting', () => {
    const run = spawnSync(process.execPath, ['scripts/serve-prod.mjs'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, DEBUG: '*' },
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('DEBUG is set');
    expect(run.stdout).toBe('');
  });
});
