import type { config } from '@tsc-run/core';
import type { Logger } from '@tsc-run/adapter-aws';

export async function deploy(config: config.Config, logger?: Logger) {
  switch (config.provider) {
    case 'aws': {
      const { deployToAws } = await import('@tsc-run/adapter-aws');
      return deployToAws(config, logger);
    }
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
