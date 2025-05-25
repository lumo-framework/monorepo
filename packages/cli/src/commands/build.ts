import type { CommandModule } from 'yargs';
import {
  expandRoutesToMethods,
  scanRoutes,
  scanSubscribers,
} from '../project/route-scanner.js';
import { bundleRoute } from '../project/bundler.js';
import { loadConfig } from '@tsc-run/core';
import fs from 'fs/promises';
import path from 'path';

export const buildCommand: CommandModule = {
  command: 'build',
  describe: 'Build the project',
  handler: async () => {
    try {
      console.log('🔧 \x1b[1mBuilding project...\x1b[0m\n');

      await loadConfig();

      // Scan for route files
      const routes = await scanRoutes();
      const methodRoutes = expandRoutesToMethods(routes);

      // Scan for subscriber files
      const subscribers = await scanSubscribers();

      // Show summary
      console.log('📊 \x1b[1mBuild Summary:\x1b[0m');
      console.log(`   📡 Routes: \x1b[36m${methodRoutes.length}\x1b[0m`);
      console.log(`   📨 Subscribers: \x1b[36m${subscribers.length}\x1b[0m\n`);

      // Clean and create dist directory
      console.log('🧹 Cleaning build directory...');
      await fs.rm('dist', { recursive: true, force: true });
      await fs.mkdir('dist', { recursive: true });
      await fs.mkdir('dist/lambdas', { recursive: true });
      await fs.mkdir('dist/lambdas/subscribers', { recursive: true });

      // Build routes
      if (methodRoutes.length > 0) {
        console.log('\n🚀 \x1b[1mBuilding Routes:\x1b[0m');
        for (const [index, methodRoute] of methodRoutes.entries()) {
          const { file, route, method, exportName } = methodRoute;
          const routeName =
            method === 'ALL' ? route : `${route}-${method.toLowerCase()}`;

          process.stdout.write(
            `   ${index + 1}/${methodRoutes.length} \x1b[33m${routeName}\x1b[0m `
          );

          // Generate wrapper file
          const wrapperPath = await generateLambdaWrapper(file, method);

          // Create directory for this Lambda
          const lambdaDir = `dist/lambdas${routeName}`;
          await fs.mkdir(lambdaDir, { recursive: true });

          // Bundle the wrapper
          const bundlePath = `${lambdaDir}/index.js`;
          await bundleRoute(wrapperPath, bundlePath);

          // Clean up temporary wrapper
          await fs.unlink(wrapperPath);

          console.log('\x1b[32m✓\x1b[0m');
        }
      }

      // Build subscribers
      if (subscribers.length > 0) {
        console.log('\n📨 \x1b[1mBuilding Subscribers:\x1b[0m');
        for (const [index, subscriber] of subscribers.entries()) {
          const { file, name } = subscriber;

          process.stdout.write(
            `   ${index + 1}/${subscribers.length} \x1b[33m${name}\x1b[0m `
          );

          // Generate wrapper file
          const wrapperPath = await generateSubscriberWrapper(file);

          // Create directory for this Lambda
          const lambdaDir = `dist/lambdas/subscribers/${name}`;
          await fs.mkdir(lambdaDir, { recursive: true });

          // Bundle the wrapper
          const bundlePath = `${lambdaDir}/index.js`;
          await bundleRoute(wrapperPath, bundlePath);

          // Clean up temporary wrapper
          await fs.unlink(wrapperPath);

          console.log('\x1b[32m✓\x1b[0m');
        }
      }

      console.log('\n✨ \x1b[1m\x1b[32mBuild completed successfully!\x1b[0m');
      console.log(
        `📦 Generated ${methodRoutes.length + subscribers.length} Lambda functions in \x1b[36mdist/lambdas/\x1b[0m\n`
      );
    } catch (error) {
      console.error('\n❌ \x1b[1m\x1b[31mBuild Failed!\x1b[0m');
      console.error(
        `\x1b[31m${error instanceof Error ? error.message : String(error)}\x1b[0m\n`
      );
      process.exit(1);
    }
  },
};

async function generateLambdaWrapper(
  routeFile: string,
  method: string
): Promise<string> {
  const wrapperContent = `
import { lambdaAdapter } from '@tsc-run/adapter-aws';
import {${method} as handler} from '${path.resolve(routeFile)}';

export const lambdaHandler = lambdaAdapter(handler);
`;

  const wrapperPath = `dist/temp-${path.basename(routeFile, '.ts')}-wrapper.ts`;
  await fs.writeFile(wrapperPath, wrapperContent);
  return wrapperPath;
}

async function generateSubscriberWrapper(
  subscriberFile: string
): Promise<string> {
  const wrapperContent = `
import { subscriberAdapter } from '@tsc-run/adapter-aws';
import {listen} from '${path.resolve(subscriberFile)}';

export const lambdaHandler = subscriberAdapter(listen);
`;

  const wrapperPath = `dist/temp-${path.basename(subscriberFile, '.ts')}-subscriber-wrapper.ts`;
  await fs.writeFile(wrapperPath, wrapperContent);
  return wrapperPath;
}
