import type { config } from '@lumo-framework/core';
import type { LogMethods } from '@lumo-framework/utils';

export async function deploy(config: config.Config, logger?: LogMethods) {
  switch (config.provider) {
    case 'aws': {
      const { deployToAws } = await import('../adapters/aws/deploy.js');
      return deployToAws(config, logger);
    }
    case 'cloudflare': {
      const { deployToCloudflareWithWrangler } = await import(
        '../adapters/cloudflare/wrangler-deploy.js'
      );
      return deployToCloudflareWithWrangler(config, logger);
    }
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
