import { build } from 'esbuild';

export async function bundleRoute(entryFile: string, outFile: string) {
  await build({
    entryPoints: [entryFile],
    bundle: true,
    outfile: outFile,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['aws-sdk', 'path', 'os', 'crypto', 'util', 'events', 'stream', 'buffer'],
    logLevel: 'error' // Suppress warnings to clean up build output
  });
}