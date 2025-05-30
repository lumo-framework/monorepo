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
      domain: {
        name: 'example.com',
        type: 'hosted-zone',
        certificate: { create: true },
      },
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
    assert.strictEqual(result.domain?.name, 'example.com');
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

  test('should work with domain certificate configurations', () => {
    const configWithCreateCert: Config = {
      projectName: 'cert-create-test',
      environment: 'test',
      provider: 'aws',
      domain: {
        name: 'test.com',
        type: 'subdomain',
        certificate: { create: true },
      },
    };

    const configWithArnCert: Config = {
      projectName: 'cert-arn-test',
      environment: 'test',
      provider: 'aws',
      domain: {
        name: 'test.com',
        type: 'external',
        certificate: {
          arn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
        },
      },
    };

    const result1 = defineConfig(configWithCreateCert);
    const result2 = defineConfig(configWithArnCert);

    assert.deepStrictEqual(result1.domain?.certificate, { create: true });
    assert.deepStrictEqual(result2.domain?.certificate, {
      arn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
    });
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
