import { defineConfig } from '@tsc-run/core';

export default defineConfig({
  projectName: 'test-project',
  provider: 'cloudflare',
  region: 'us-east-1',
  events: {
    eventBus: 'default',
    subscribers: {
      'user-events': {
        events: ['user.created', 'user.updated'],
      },
    },
  },
});
