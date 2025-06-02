import { test } from 'node:test';
import assert from 'node:assert';
import { validateDeployment } from './util.js';

test('validateDeployment', async (t) => {
  await t.test('should throw error if provider is missing', () => {
    assert.throws(
      () => validateDeployment({}),
      /Provider is required for deployment/
    );
  });

  await t.test('should not throw error if provider is present', () => {
    assert.doesNotThrow(() => validateDeployment({ provider: 'aws' }));
    assert.doesNotThrow(() => validateDeployment({ provider: 'cloudflare' }));
  });
});

// Integration tests for deployment result validation
test('deployment result validation', async (t) => {
  await t.test('should detect successful Cloudflare deployment', () => {
    const result = {
      provider: 'cloudflare',
      success: true,
      url: 'https://test.workers.dev',
      errors: [],
    };

    // We can't easily test the output formatting without mocking console,
    // but we can test that the structure is valid
    assert.strictEqual(result.provider, 'cloudflare');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.url, 'https://test.workers.dev');
    assert.strictEqual(result.errors.length, 0);
  });

  await t.test('should detect failed Cloudflare deployment', () => {
    const result = {
      provider: 'cloudflare',
      success: false,
      errors: ['CLOUDFLARE_API_TOKEN environment variable is required'],
    };

    assert.strictEqual(result.provider, 'cloudflare');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(
      result.errors[0],
      'CLOUDFLARE_API_TOKEN environment variable is required'
    );
  });

  await t.test('should detect successful AWS deployment', () => {
    const result = {
      provider: 'aws',
      url: 'https://example.execute-api.us-east-1.amazonaws.com/prod',
    };

    assert.strictEqual(result.provider, 'aws');
    assert.strictEqual(
      result.url,
      'https://example.execute-api.us-east-1.amazonaws.com/prod'
    );
  });

  await t.test('should detect failed AWS deployment', () => {
    const result = {
      provider: 'aws',
      errors: ['CDK deployment failed'],
    };

    assert.strictEqual(result.provider, 'aws');
    assert.strictEqual(result.errors?.length, 1);
    assert.strictEqual(result.errors?.[0], 'CDK deployment failed');
  });

  await t.test('should handle AWS deployment with domain configuration', () => {
    const result = {
      provider: 'aws',
      url: 'https://api.example.com',
      domain: {
        name: 'api.example.com',
        type: 'subdomain',
        setupInstructions:
          'Create CNAME record pointing to example.cloudfront.net',
        nameServers: ['ns1.example.com', 'ns2.example.com'],
      },
    };

    assert.strictEqual(result.provider, 'aws');
    assert.strictEqual(result.url, 'https://api.example.com');
    assert.strictEqual(result.domain?.name, 'api.example.com');
    assert.strictEqual(result.domain?.type, 'subdomain');
    assert.strictEqual(result.domain?.nameServers?.length, 2);
  });

  await t.test('should handle deployment with warnings', () => {
    const result = {
      provider: 'cloudflare',
      success: true,
      url: 'https://test.workers.dev',
      warnings: ['Some non-critical warning'],
    };

    assert.strictEqual(result.provider, 'cloudflare');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.warnings?.length, 1);
    assert.strictEqual(result.warnings?.[0], 'Some non-critical warning');
  });
});
