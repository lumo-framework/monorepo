import type { CommandModule } from 'yargs';
import {
  expandRoutesToMethods,
  scanRoutes,
  scanSubscribers,
} from '../project/route-scanner.js';
import { bundleRoute } from '../project/bundler.js';
import { loadConfig, type config } from '@lumo-framework/core';
import { log } from '@lumo-framework/utils';
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
      await fs.mkdir('dist/functions', { recursive: true });
      await fs.mkdir('dist/functions/subscribers', { recursive: true });

      // Get external modules from config
      const externalModules = config.build?.exclude || [];

      // Build all functions in parallel
      const totalFunctions = methodRoutes.length + subscribers.length;
      if (totalFunctions > 0) {
        console.log();
        log.heading(`Building ${totalFunctions} Functions`);

        // Create build tasks for routes and subscribers
        const buildTasks: Promise<void>[] = [];

        // Add route build tasks
        methodRoutes.forEach((methodRoute) => {
          const { file, route, method } = methodRoute;
          // Create filesystem-safe route name by replacing [param] with {param}
          const safeRoute = route.replace(/\[([^\]]+)\]/g, '{$1}');
          const routeName =
            method === 'ALL'
              ? safeRoute
              : `${safeRoute}-${method.toLowerCase()}`;
          buildTasks.push(
            buildFunction(
              'route',
              routeName,
              file,
              method,
              externalModules,
              config
            )
          );
        });

        // Add subscriber build tasks
        subscribers.forEach((subscriber) => {
          const { file, name } = subscriber;
          buildTasks.push(
            buildFunction(
              'subscriber',
              name,
              file,
              'listen',
              externalModules,
              config
            )
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
        `Generated ${methodRoutes.length + subscribers.length} functions in dist/functions/`
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
  externalModules: string[],
  config: config.Config
): Promise<void> {
  // Generate wrapper file based on provider
  const wrapperPath =
    type === 'route'
      ? await generateRouteWrapper(file, method, config.provider)
      : await generateSubscriberWrapper(file, config.provider);

  // Create directory for this function
  const functionDir =
    type === 'route'
      ? `dist/functions${name}`
      : `dist/functions/subscribers/${name}`;
  await fs.mkdir(functionDir, { recursive: true });

  // Bundle the wrapper
  const bundlePath = `${functionDir}/index.js`;
  await bundleRoute(wrapperPath, bundlePath, externalModules, config.provider);

  // Clean up temporary wrapper
  await fs.unlink(wrapperPath);
}

async function generateRouteWrapper(
  routeFile: string,
  method: string,
  provider: string
): Promise<string> {
  let wrapperContent: string;

  if (provider === 'aws') {
    wrapperContent = `
import { initializeSecretResolver } from '@lumo-framework/adapter-aws/secret-resolver';
import { lambdaAdapter } from '@lumo-framework/adapter-aws';
import {${method} as handler} from '${path.resolve(routeFile)}';

initializeSecretResolver();
export const lambdaHandler = lambdaAdapter(handler);
`;
  } else if (provider === 'cloudflare') {
    wrapperContent = `
import { initializeSecretResolver } from '@lumo-framework/adapter-cloudflare/secret-resolver';
import { workerAdapter } from '@lumo-framework/adapter-cloudflare';
import {${method} as handler} from '${path.resolve(routeFile)}';

const adaptedHandler = workerAdapter(handler);

export default {
  async fetch(request, env, ctx) {
    initializeSecretResolver(env);
    return adaptedHandler(request, env, ctx);
  }
};
`;
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const wrapperPath = `dist/temp-${path.basename(routeFile, '.ts')}-${method}-${timestamp}-${random}-wrapper.ts`;
  await fs.writeFile(wrapperPath, wrapperContent);
  return wrapperPath;
}

async function generateSubscriberWrapper(
  subscriberFile: string,
  provider: string
): Promise<string> {
  let wrapperContent: string;

  if (provider === 'aws') {
    wrapperContent = `
import { initializeSecretResolver } from '@lumo-framework/adapter-aws/secret-resolver';
import { subscriberAdapter } from '@lumo-framework/adapter-aws';
import {listen} from '${path.resolve(subscriberFile)}';

initializeSecretResolver();
export const lambdaHandler = subscriberAdapter(listen);
`;
  } else if (provider === 'cloudflare') {
    wrapperContent = `
import { initializeSecretResolver } from '@lumo-framework/adapter-cloudflare/secret-resolver';
import { queueAdapter } from '@lumo-framework/adapter-cloudflare';
import {listen} from '${path.resolve(subscriberFile)}';

const queueHandler = queueAdapter(listen);

export default {
  async queue(batch, env, ctx) {
    initializeSecretResolver(env);
    return queueHandler(batch, env, ctx);
  }
};
`;
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const wrapperPath = `dist/temp-${path.basename(subscriberFile, '.ts')}-subscriber-${timestamp}-${random}-wrapper.ts`;
  await fs.writeFile(wrapperPath, wrapperContent);
  return wrapperPath;
}
