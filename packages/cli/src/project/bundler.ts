import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function bundleRoute(
  entryFile: string,
  outFile: string,
  externalModules: string[] = [],
  provider: string = 'aws'
) {
  const esmOutFile = outFile.endsWith('.mjs')
    ? outFile
    : outFile.replace('.js', '.mjs');

  const baseConfig = {
    entryPoints: [entryFile],
    bundle: true,
    outfile: esmOutFile,
    format: 'esm' as const,
    minify: true,
    treeShaking: true,
    metafile: false,
    logLevel: 'error' as const,
  };

  if (provider === 'cloudflare') {
    // Cloudflare Workers configuration
    await build({
      ...baseConfig,
      platform: 'browser',
      target: 'es2022',
      define: {
        'process.env.NODE_ENV': '"production"',
        global: 'globalThis',
      },
      external: [
        // Cloudflare Workers built-ins
        'cloudflare:*',

        // Additional caller-specified externals
        ...externalModules,
      ],
      alias: {
        // Node.js built-ins that don't exist in Cloudflare Workers - replace with empty implementations
        fs: 'data:text/javascript,export default {}; export const readFileSync = () => ""; export const writeFileSync = () => {}; export const existsSync = () => false;',
        path: 'data:text/javascript,export default {}; export const resolve = (...args) => args.join("/"); export const join = (...args) => args.join("/"); export const dirname = (p) => p.split("/").slice(0, -1).join("/"); export const basename = (p) => p.split("/").pop(); export const extname = (p) => { const parts = p.split("."); return parts.length > 1 ? "." + parts.pop() : ""; };',
        url: 'data:text/javascript,export default {}; export const fileURLToPath = (url) => url.replace("file://", ""); export const pathToFileURL = (path) => "file://" + path;',
        os: 'data:text/javascript,export default {}; export const platform = () => "browser";',
        crypto: 'data:text/javascript,export default {};',
        stream: 'data:text/javascript,export default {};',
        util: 'data:text/javascript,export default {}; export const promisify = (fn) => fn;',
        events:
          'data:text/javascript,export default class EventEmitter { on() {} emit() {} }; export const EventEmitter = class { on() {} emit() {} };',
        assert: 'data:text/javascript,export default () => {};',
        process:
          'data:text/javascript,export default { env: {}, argv: [], cwd: () => "/", platform: "browser" };',
        buffer:
          'data:text/javascript,export default { from: (data) => data }; export const Buffer = { from: (data) => data };',

        // Alias adapter packages to their built versions in development
        '@tsc-run/adapter-cloudflare': path.resolve(
          __dirname,
          '../../../adapter-cloudflare/dist/index.js'
        ),
        '@tsc-run/adapter-cloudflare/secret-resolver': path.resolve(
          __dirname,
          '../../../adapter-cloudflare/dist/secret-resolver.js'
        ),
        '@tsc-run/adapter-cloudflare/queue-adapter': path.resolve(
          __dirname,
          '../../../adapter-cloudflare/dist/queue-adapter.js'
        ),
        '@tsc-run/adapter-cloudflare/event-dispatcher': path.resolve(
          __dirname,
          '../../../adapter-cloudflare/dist/event-dispatcher.js'
        ),
      },
    });
  } else {
    // AWS configuration (default)
    await build({
      ...baseConfig,
      platform: 'node',
      target: 'node20',
      external: [
        // Node.js built-ins
        'node:*',

        // AWS SDK and CDK
        'aws-cdk-lib',
        'constructs',
        '@aws-cdk/*',
        '@aws-sdk/*',
        'aws-sdk',

        // Database Drivers
        'mysql2',
        'mysql',
        'sqlite3',
        'oracledb',
        'pg-native',
        'tedious',
        'better-sqlite3',

        // Build tools (never needed at runtime)
        'esbuild',
        'typescript',
        'webpack',
        'rollup',
        'vite',

        // Additional caller-specified externals
        ...externalModules,
      ],
    });
  }
}
