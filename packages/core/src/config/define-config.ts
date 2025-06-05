import { Config } from './schema.js';

/**
 * Define a Lumo configuration with full TypeScript support
 *
 * @param config - The configuration object
 * @returns The same configuration object (for type inference)
 *
 * @example
 * ```ts
 * import { defineConfig } from '@lumo-framework/core';
 *
 * export default defineConfig({
 *   projectName: 'my-app',
 *   environment: 'prod',
 *   provider: 'aws',
 *   region: 'us-east-1',
 *   events: {
 *     subscribers: {
 *       'send-welcome-email': {
 *         events: ['user.registered']
 *       }
 *     }
 *   }
 * });
 * ```
 */
export function defineConfig(config: Config): Config {
  return config;
}
