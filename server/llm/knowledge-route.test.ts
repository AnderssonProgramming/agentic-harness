// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createServer, get as httpGet, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { LLM_CONFIG } from './config.ts';
import type { Env } from './engine.ts';
import { createKnowledgeHandler } from './handler.ts';
import { buildKnowledge, documentTitle, knowledgeFile } from './knowledge.ts';
import { knowledgeRoute } from './knowledge-route.ts';
import { createWebApiHandler } from './web-handler.ts';

const SITE = 'https://compass.example';
const mockEnv = (): Env => ({ INFERENCE_ENGINE: 'mock', MOCK_DELAY_MS: '0' });

// "big.md" fits Anthropic's budget but not the mock's, so it's loaded yet not served on the mock.
const knowledge = buildKnowledge(
  [
    knowledgeFile('branch-naming.md', '# Branch naming\n\nUse `<type>/<item-id>-<slug>`.\n'),
    knowledgeFile('no-heading.md', 'Plain text, no heading.\n'),
    knowledgeFile('leak.md', 'ANTHROPIC key: sk-ant-abc123\n'),
    knowledgeFile('zz-big.md', `# Big\n${'x'.repeat(9_000)}\n`),
  ],
  { anthropic: 40_000, ollama: 8_000, mock: 8_000 },
);

const route = (subpath: string, method = 'GET', env = mockEnv) =>
  knowledgeRoute({ env, knowledge }, method, subpath);

describe('GET /api/knowledge (B-07)', () => {
  it('lists the documents the active engine was given, with their titles, in the order sent', () => {
    const result = route('');
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body ?? '')).toEqual([
      { source: 'branch-naming.md', title: 'Branch naming' },
      { source: 'no-heading.md', title: 'no-heading.md' },
    ]);
    expect(route('/').status).toBe(200);
  });

  it('never lists a document that failed a guard (secrets) or the engine budget', () => {
    const anthropic = route('', 'GET', () => ({
      INFERENCE_ENGINE: 'anthropic',
      ANTHROPIC_API_KEY: 'k',
    }));
    const sources = (JSON.parse(anthropic.body ?? '') as { source: string }[]).map((d) => d.source);
    expect(sources).toEqual(['branch-naming.md', 'no-heading.md', 'zz-big.md']);
    expect(sources).not.toContain('leak.md');
  });

  it('answers 503 with the config error when the engine is misconfigured, like /api/engine', () => {
    const result = route('', 'GET', () => ({ INFERENCE_ENGINE: 'nope' }));
    expect(result.status).toBe(503);
    expect(JSON.parse(result.body ?? '')).toMatchObject({ error: { code: 'config' } });
  });

  it('rejects every method but GET', () => {
    expect(route('', 'POST')).toMatchObject({ status: 405, allow: 'GET' });
    expect(route('/branch-naming.md', 'DELETE')).toMatchObject({ status: 405, allow: 'GET' });
  });
});

describe('GET /api/knowledge/<source> (B-07)', () => {
  it('returns a served document as plain text', () => {
    expect(route('/branch-naming.md')).toEqual({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: '# Branch naming\n\nUse `<type>/<item-id>-<slug>`.\n',
    });
  });

  it('refuses anything not in the loaded list with 404: traversal, absolute paths, guarded, unbudgeted, inherited names', () => {
    const refused = [
      '/leak.md', // failed the secrets guard
      '/zz-big.md', // loaded, but not given to the mock engine
      '/missing.md',
      '/..%2Fpackage.json',
      '/..%2F..%2F.env',
      '/%2E%2E%2Fknowledge%2Fbranch-naming.md',
      '/..%5Cpackage.json',
      '/%2Fetc%2Fpasswd',
      '/C%3A%5CWindows%5Cwin.ini',
      '/..',
      '/../branch-naming.md',
      '/knowledge/branch-naming.md',
      '/branch-naming.md/',
      '//branch-naming.md',
      '/branch-naming.md%00',
      '/%E0%A4%A', // malformed escape
      '/constructor',
      '/__proto__',
      '/toString',
      'branch-naming.md', // no leading slash: not a subpath of the route
    ];
    for (const subpath of refused) expect(route(subpath).status, subpath).toBe(404);
  });

  it('accepts an encoded name only when it decodes to a served name', () => {
    expect(route('/branch%2Dnaming.md').status).toBe(200);
  });
});

describe('documentTitle', () => {
  it('takes the first # heading, else the file name', () => {
    expect(documentTitle('a.md', 'intro\n## Sub\n# Main title #\n# Second')).toBe('Main title');
    expect(documentTitle('a.md', '## Only a subheading')).toBe('a.md');
  });
});

describe('both adapters route /api/knowledge (ADR-13)', () => {
  it('the Web adapter: exact path and sub-paths, nothing that only starts with the name', async () => {
    const handle = createWebApiHandler({ env: mockEnv, knowledge });
    const list = handle(new Request(`${SITE}${LLM_CONFIG.knowledgeRoute}`));
    expect(list.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await list.json()).toHaveLength(2);
    expect(handle(new Request(`${SITE}${LLM_CONFIG.knowledgeRoute}/no-heading.md`)).status).toBe(
      200,
    );
    expect(handle(new Request(`${SITE}${LLM_CONFIG.knowledgeRoute}x`)).status).toBe(404);
    // The URL parser resolves "..", so this is /api/engine's sibling, not a knowledge path.
    expect(handle(new Request(`${SITE}${LLM_CONFIG.knowledgeRoute}/../knowledge.md`)).status).toBe(
      404,
    );
  });

  it('the Node adapter, over a real socket with a raw, unnormalized "../" path', async () => {
    const handleKnowledge = createKnowledgeHandler({ env: mockEnv, knowledge });
    // The prefix strip that Connect does in Vite, done by hand.
    const server: Server = createServer((req, res) => {
      req.url = (req.url ?? '').slice(LLM_CONFIG.knowledgeRoute.length);
      handleKnowledge(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const get = (path: string) =>
      new Promise<number>((resolve, reject) => {
        // node:http sends the path as written, so "../" reaches the handler unresolved.
        httpGet({ host: '127.0.0.1', port, path }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }).on('error', reject);
      });
    try {
      expect(await get(`${LLM_CONFIG.knowledgeRoute}/branch-naming.md`)).toBe(200);
      expect(await get(`${LLM_CONFIG.knowledgeRoute}/../package.json`)).toBe(404);
      expect(await get(`${LLM_CONFIG.knowledgeRoute}/../../.env`)).toBe(404);
      expect(await get(`${LLM_CONFIG.knowledgeRoute}/..%2Fpackage.json`)).toBe(404);
      expect(await get(`${LLM_CONFIG.knowledgeRoute}?x=1`)).toBe(200);
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  });
});
