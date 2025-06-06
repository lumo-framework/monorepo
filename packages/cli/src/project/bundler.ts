import { build } from 'esbuild';
import { promises as fs } from 'fs';
import path from 'path';

interface CopyAsset {
  from: string;
  to?: string;
}

async function copyAssetsToDirectory(
  outDir: string,
  assets: CopyAsset[] = [],
  externalModules: string[] = []
) {
  for (const asset of assets) {
    const sourcePath = path.resolve(process.cwd(), asset.from);
    const targetPath = asset.to
      ? path.resolve(outDir, asset.to)
      : path.resolve(outDir, path.basename(asset.from));

    try {
      const stat = await fs.stat(sourcePath);

      if (stat.isDirectory()) {
        await copyDirectory(sourcePath, targetPath, externalModules);
      } else {
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await copyFileOrCompile(sourcePath, targetPath);
      }
    } catch (error) {
      console.warn(
        `Warning: Failed to copy asset from ${sourcePath} to ${targetPath}:`,
        error
      );
    }
  }
}

async function copyDirectory(
  source: string,
  target: string,
  externalModules: string[] = []
) {
  await fs.mkdir(target, { recursive: true });

  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath, externalModules);
    } else {
      await copyFileOrCompile(sourcePath, targetPath, externalModules);
    }
  }
}

async function copyFileOrCompile(
  sourcePath: string,
  targetPath: string,
  externalModules: string[] = []
) {
  if (sourcePath.endsWith('.ts') && !sourcePath.endsWith('.d.ts')) {
    // Compile TypeScript files with proper bundling
    const compiledTargetPath = targetPath.replace(/\.ts$/, '.mjs');

    try {
      await build({
        entryPoints: [sourcePath],
        bundle: true,
        outfile: compiledTargetPath,
        format: 'esm',
        target: 'es2022',
        platform: 'node',
        minify: false,
        treeShaking: true,
        metafile: false,
        logLevel: 'error',
        absWorkingDir: process.cwd(),
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
    } catch (error) {
      console.warn(
        `Warning: Failed to compile TypeScript file ${sourcePath}:`,
        error
      );
      // Fall back to copying the original file
      await fs.copyFile(sourcePath, targetPath);
    }
  } else {
    // Copy non-TypeScript files as-is
    await fs.copyFile(sourcePath, targetPath);
  }
}

export async function bundleRoute(
  entryFile: string,
  outFile: string,
  externalModules: string[] = [],
  provider: string = 'aws',
  copyAssets: CopyAsset[] = []
) {
  const esmOutFile = outFile.endsWith('.mjs')
    ? outFile
    : outFile.replace('.js', '.mjs');

  const baseConfig = {
    entryPoints: [entryFile],
    bundle: true,
    outfile: esmOutFile,
    format: 'esm' as const,
    target: 'es2022',
    minify: true,
    treeShaking: true,
    metafile: false,
    logLevel: 'error' as const,
  };

  if (provider === 'cloudflare') {
    // Cloudflare Workers configuration
    await build({
      ...baseConfig,
      absWorkingDir: process.cwd(),
      platform: 'browser',
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
      },
    });
  } else {
    // AWS configuration (default)
    await build({
      ...baseConfig,
      absWorkingDir: process.cwd(),
      platform: 'node',
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

  // Copy assets after bundling
  if (copyAssets.length > 0) {
    const outDir = path.dirname(esmOutFile);
    await copyAssetsToDirectory(outDir, copyAssets, externalModules);
  }
}
