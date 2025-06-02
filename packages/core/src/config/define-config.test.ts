import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { defineConfig } from './define-config.js';
import { Config } from './schema';

describe('defineConfig', () => {
  test('should return the same config object passed to it', () => {
    const config: Config = {
      projectName: 'test-app',
      environment: 'test',
      provider: 'aws',
    };

    const result = defineConfig(config);

    assert.strictEqual(result, config);
    assert.deepStrictEqual(result, config);
  });

  test('should work with minimal configuration', () => {
    const config: Config = {
      projectName: 'minimal-app',
      environment: 'dev',
      provider: 'aws',
    };

    const result = defineConfig(config);

    assert.strictEqual(result.projectName, 'minimal-app');
    assert.strictEqual(result.environment, 'dev');
    assert.strictEqual(result.provider, 'aws');
  });

  test('should work with full configuration', () => {
    const config: Config = {
      projectName: 'full-app',
      environment: 'prod',
      provider: 'aws',
      region: 'us-west-2',
      domainName: 'example.com',
      networking: {
        natGateways: 2,
      },
      build: {
        exclude: ['*.test.ts'],
      },
      secrets: {
        'api-key': {
          value: 'secret-value',
          description: 'API key for external service',
        },
        'db-password': {
          value: () => 'dynamic-password',
        },
      },
      events: {
        eventBus: 'custom-bus',
        subscribers: {
          'user-handler': {
            events: ['user.created', 'user.updated'],
          },
          'email-handler': {
            events: ['email.sent'],
          },
        },
      },
    };

    const result = defineConfig(config);

    assert.deepStrictEqual(result, config);
    assert.strictEqual(result.projectName, 'full-app');
    assert.strictEqual(result.environment, 'prod');
    assert.strictEqual(result.provider, 'aws');
    assert.strictEqual(result.region, 'us-west-2');
    assert.strictEqual(result.domainName, 'example.com');
    assert.strictEqual(result.networking?.natGateways, 2);
    assert.deepStrictEqual(result.build?.exclude, ['*.test.ts']);
    assert.strictEqual(result.secrets?.['api-key']?.value, 'secret-value');
    assert.strictEqual(result.events?.eventBus, 'custom-bus');
  });

  test('should preserve object references', () => {
    const events = {
      eventBus: 'test-bus',
      subscribers: {
        'test-handler': {
          events: ['test.event'],
        },
      },
    };

    const config: Config = {
      projectName: 'reference-test',
      environment: 'test',
      provider: 'aws',
      events,
    };

    const result = defineConfig(config);

    assert.strictEqual(result.events, events);
    assert.strictEqual(
      result.events?.subscribers?.['test-handler'],
      events.subscribers['test-handler']
    );
  });

  test('should work with function-based secret values', () => {
    const secretFunction = () => 'computed-secret';

    const config: Config = {
      projectName: 'function-secret-test',
      environment: 'test',
      provider: 'aws',
      secrets: {
        'computed-secret': {
          value: secretFunction,
          description: 'A computed secret value',
        },
      },
    };

    const result = defineConfig(config);

    assert.strictEqual(
      result.secrets?.['computed-secret']?.value,
      secretFunction
    );
    assert.strictEqual(
      result.secrets?.['computed-secret']?.description,
      'A computed secret value'
    );
  });

  test('should work with domain configurations', () => {
    const configWithDomain: Config = {
      projectName: 'domain-test',
      environment: 'test',
      provider: 'aws',
      domainName: 'api.example.com',
    };

    const result = defineConfig(configWithDomain);

    assert.strictEqual(result.domainName, 'api.example.com');
  });

  test('should maintain type safety for provider enum', () => {
    const config: Config = {
      projectName: 'enum-test',
      environment: 'test',
      provider: 'aws',
    };

    const result = defineConfig(config);

    assert.strictEqual(result.provider, 'aws');
  });
});
