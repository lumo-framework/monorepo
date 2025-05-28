import { build } from 'esbuild';

export async function bundleRoute(
  entryFile: string,
  outFile: string,
  externalModules: string[] = []
) {
  const defaultExternal = [
    'aws-sdk',
    'path',
    'os',
    'crypto',
    'util',
    'events',
    'stream',
    'buffer',
  ];

  await build({
    entryPoints: [entryFile],
    bundle: true,
    outfile: outFile,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: [...defaultExternal, ...externalModules],
    logLevel: 'error', // Suppress warnings to clean up build output
  });
}
