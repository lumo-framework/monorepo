import { build } from 'esbuild';

export async function bundleRoute(
  entryFile: string,
  outFile: string,
  externalModules: string[] = []
) {
  const esmOutFile = outFile.endsWith('.mjs')
    ? outFile
    : outFile.replace('.js', '.mjs');

  await build({
    entryPoints: [entryFile],
    bundle: true,
    outfile: esmOutFile,
    platform: 'node',
    target: 'node20',
    format: 'esm',
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
    minify: true,
    treeShaking: true,
    metafile: false,
    logLevel: 'error',
  });
}
