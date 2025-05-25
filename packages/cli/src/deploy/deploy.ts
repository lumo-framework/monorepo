import type { config } from '@tsc-run/core';

export async function deploy(config: config.Config) {
  switch (config.provider) {
    case 'aws': {
      const { deployToAws } = await import('@tsc-run/adapter-aws');
      return deployToAws(config);
    }
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
