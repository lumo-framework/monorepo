import { secrets } from '@tsc-run/core';
import { initializeCloudflareEventDispatcher } from './event-dispatcher.js';

const createCloudflareSecretResolver = (env: Record<string, unknown>) => {
  return async (key: string): Promise<string> => {
    const envValue = env[key];
    return envValue?.toString() || '';
  };
};

export const initializeSecretResolver = (env: Record<string, unknown>) => {
  const resolver = createCloudflareSecretResolver(env);
  secrets.setSecretResolver(resolver);

  initializeCloudflareEventDispatcher(env);

  return resolver;
};
