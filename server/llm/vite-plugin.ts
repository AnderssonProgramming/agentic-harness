import { loadEnv, type Connect, type Plugin } from 'vite';
import { LLM_CONFIG } from './config.ts';
import type { Env } from './engine.ts';
import { createChatHandler } from './handler.ts';

/**
 * Serves the chat endpoint from Vite's own dev and preview servers (ADR-08), so the app still
 * runs with one command. Variables come from .env files without the VITE_ prefix, so they never
 * reach the browser bundle; real environment variables win over the files.
 */
export function llmApi(): Plugin {
  let env: Env = {};
  const mount = (middlewares: Connect.Server) => {
    const handleChat = createChatHandler({ env: () => env });
    middlewares.use(LLM_CONFIG.route, (req, res, next) => {
      handleChat(req, res).catch(next);
    });
  };
  return {
    name: 'llm-api',
    configResolved(config) {
      const envDir = typeof config.envDir === 'string' ? config.envDir : config.root;
      env = { ...loadEnv(config.mode, envDir, ''), ...process.env };
    },
    configureServer(server) {
      mount(server.middlewares);
    },
    configurePreviewServer(server) {
      mount(server.middlewares);
    },
  };
}
