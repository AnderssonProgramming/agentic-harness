// Pure rules for `npm run serve:prod` (contract docs/delegations/deploy-netlify.md, Amendment 2).
// The local production run must be structurally unable to hold a real secret, so the child's
// environment is built here, not inherited, and anything that could dump it is refused.

/** A variable name that holds a secret. Case-insensitive because Windows names are. */
export const SECRET_NAME = /(?:KEY|TOKEN|SECRET|PASSWORD)$/i;

/** Variables that turn on debug loggers, which print the resolved environment. */
const DEBUG_NAME = /^(?:NODE_)?DEBUG$/i;

/** The only arguments forwarded to `netlify serve`; everything else is refused. */
const PORT_FLAGS = ['--port', '--functions-port'];

/** The secret names declared in `.env.example` (its values are empty; only names are read). */
export function secretNamesFrom(envExample) {
  return envExample
    .split(/\r?\n/)
    .map((line) => /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1])
    .filter((name) => name !== undefined && SECRET_NAME.test(name));
}

/**
 * Why the wrapper must not start, or null. It accepts only `--port <n>` and
 * `--functions-port <n>` (also as `--flag=<n>`), and no debug variable in its environment.
 */
export function refusal(args, parentEnv) {
  const debugVar = Object.keys(parentEnv).find((name) => DEBUG_NAME.test(name) && parentEnv[name]);
  if (debugVar) return `${debugVar} is set: debug loggers print the environment. Unset it.`;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (/debug/i.test(arg)) return `"${arg}" is refused: debug output prints the environment.`;
    if (/_API_KEY|KEY=|TOKEN|SECRET|--auth/i.test(arg))
      return 'A secret-looking argument is refused: serve:prod runs on the mock engine only.';
    const [flag, inline] = arg.split('=', 2);
    if (!PORT_FLAGS.includes(flag)) return `"${arg}" is refused: only --port and --functions-port.`;
    const value = inline ?? args[(i += 1)];
    if (!/^\d{1,5}$/.test(value ?? '')) return `${flag} needs a port number.`;
  }
  return null;
}

/**
 * The environment `netlify serve` runs with: the parent's, minus debug variables, with every
 * secret set to an empty value (so the CLI's `.env` injection sees it as already defined) and
 * the engine forced to the mock.
 */
export function childEnv(parentEnv, secretNames) {
  const env = {};
  for (const [name, value] of Object.entries(parentEnv)) {
    if (DEBUG_NAME.test(name) || /^INFERENCE_ENGINE$/i.test(name)) continue;
    env[name] = SECRET_NAME.test(name) ? '' : value;
  }
  for (const name of secretNames) env[name] = '';
  env.INFERENCE_ENGINE = 'mock';
  env.BROWSER = 'none';
  return env;
}

/** The netlify serve arguments for allowed user arguments. */
export function serveArgs(args) {
  return ['serve', '--offline', ...args];
}
