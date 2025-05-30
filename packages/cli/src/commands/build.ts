import type { CommandModule } from 'yargs';
import {
  expandRoutesToMethods,
  scanRoutes,
  scanSubscribers,
} from '../project/route-scanner.js';
import { bundleRoute } from '../project/bundler.js';
import { loadConfig } from '@tsc-run/core';
import { log } from '@tsc-run/utils';
import fs from 'fs/promises';
import path from 'path';

export const buildCommand: CommandModule = {
  command: 'build',
  describe: 'Build the project',
  handler: async () => {
    try {
      log.heading('Building project...');
      console.log();

      const config = await loadConfig();

      // Scan for route files
      const routes = await scanRoutes();
      const methodRoutes = expandRoutesToMethods(routes);

      // Scan for subscriber files
      const subscribers = await scanSubscribers();

      // Show summary
      log.heading('Build Summary');
      log.info(`Routes: ${methodRoutes.length}`);
      log.info(`Subscribers: ${subscribers.length}`);
      console.log();

      // Clean and create dist directory
      log.info('Cleaning build directory...');
      await fs.rm('dist', { recursive: true, force: true });
      await fs.mkdir('dist', { recursive: true });
      await fs.mkdir('dist/lambdas', { recursive: true });
      await fs.mkdir('dist/lambdas/subscribers', { recursive: true });

      // Get external modules from config
      const externalModules = config.build?.exclude || [];

      // Build all functions in parallel
      const totalFunctions = methodRoutes.length + subscribers.length;
      if (totalFunctions > 0) {
        console.log();
        log.heading(`Building ${totalFunctions} Lambda Functions`);

        // Create build tasks for routes and subscribers
        const buildTasks: Promise<void>[] = [];

        // Add route build tasks
        methodRoutes.forEach((methodRoute) => {
          const { file, route, method } = methodRoute;
          const routeName =
            method === 'ALL' ? route : `${route}-${method.toLowerCase()}`;
          buildTasks.push(
            buildFunction('route', routeName, file, method, externalModules)
          );
        });

        // Add subscriber build tasks
        subscribers.forEach((subscriber) => {
          const { file, name } = subscriber;
          buildTasks.push(
            buildFunction('subscriber', name, file, 'listen', externalModules)
          );
        });

        // Execute all builds in parallel with progress tracking
        await log.spinner(
          `Building ${totalFunctions} functions...`,
          async () => {
            await Promise.all(buildTasks);
          }
        );
      }

      console.log();
      log.success('Build completed successfully!');
      log.info(
        `Generated ${methodRoutes.length + subscribers.length} Lambda functions in dist/lambdas/`
      );
      console.log();
    } catch (error) {
      console.log();
      log.error('Build Failed!');
      log.error(error instanceof Error ? error.message : String(error));
      console.log();
      process.exit(1);
    }
  },
};

async function buildFunction(
  type: 'route' | 'subscriber',
  name: string,
  file: string,
  method: string,
  externalModules: string[]
): Promise<void> {
  // Generate wrapper file
  const wrapperPath =
    type === 'route'
      ? await generateLambdaWrapper(file, method)
      : await generateSubscriberWrapper(file);

  // Create directory for this Lambda
  const lambdaDir =
    type === 'route'
      ? `dist/lambdas${name}`
      : `dist/lambdas/subscribers/${name}`;
  await fs.mkdir(lambdaDir, { recursive: true });

  // Bundle the wrapper
  const bundlePath = `${lambdaDir}/index.js`;
  await bundleRoute(wrapperPath, bundlePath, externalModules);

  // Clean up temporary wrapper
  await fs.unlink(wrapperPath);
}

async function generateLambdaWrapper(
  routeFile: string,
  method: string
): Promise<string> {
  const wrapperContent = `
import '@tsc-run/adapter-aws/secret-resolver';
import { lambdaAdapter } from '@tsc-run/adapter-aws';
import {${method} as handler} from '${path.resolve(routeFile)}';

export const lambdaHandler = lambdaAdapter(handler);
`;

  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const wrapperPath = `dist/temp-${path.basename(routeFile, '.ts')}-${method}-${timestamp}-${random}-wrapper.ts`;
  await fs.writeFile(wrapperPath, wrapperContent);
  return wrapperPath;
}

async function generateSubscriberWrapper(
  subscriberFile: string
): Promise<string> {
  const wrapperContent = `
import '@tsc-run/adapter-aws/secret-resolver';
import { subscriberAdapter } from '@tsc-run/adapter-aws';
import {listen} from '${path.resolve(subscriberFile)}';

export const lambdaHandler = subscriberAdapter(listen);
`;

  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const wrapperPath = `dist/temp-${path.basename(subscriberFile, '.ts')}-subscriber-${timestamp}-${random}-wrapper.ts`;
  await fs.writeFile(wrapperPath, wrapperContent);
  return wrapperPath;
}
