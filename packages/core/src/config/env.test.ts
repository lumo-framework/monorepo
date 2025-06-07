import { describe, test, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { env } from './env.js';

describe('env', () => {
  let originalEnv: { [key: string]: string | undefined };

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should return environment variable value when it exists', () => {
    process.env.TEST_VAR = 'test-value';

    const result = env('TEST_VAR');

    assert.strictEqual(result, 'test-value');
  });

  test('should return fallback when environment variable is undefined', () => {
    delete process.env.TEST_VAR;

    const result = env('TEST_VAR', 'fallback-value');

    assert.strictEqual(result, 'fallback-value');
  });

  test('should return default empty string when no fallback provided and variable is undefined', () => {
    delete process.env.TEST_VAR;

    const result = env('TEST_VAR');

    assert.strictEqual(result, '');
  });

  test('should return fallback when environment variable is empty string', () => {
    process.env.TEST_VAR = '';

    const result = env('TEST_VAR', 'fallback-value');

    assert.strictEqual(result, 'fallback-value');
  });

  test('should return environment variable when it has whitespace', () => {
    process.env.TEST_VAR = '  spaced value  ';

    const result = env('TEST_VAR', 'fallback-value');

    assert.strictEqual(result, '  spaced value  ');
  });

  test('should return environment variable when it is "0"', () => {
    process.env.TEST_VAR = '0';

    const result = env('TEST_VAR', 'fallback-value');

    assert.strictEqual(result, '0');
  });

  test('should return environment variable when it is "false"', () => {
    process.env.TEST_VAR = 'false';

    const result = env('TEST_VAR', 'fallback-value');

    assert.strictEqual(result, 'false');
  });

  test('should handle complex environment variable names', () => {
    process.env['COMPLEX_VAR_NAME_123'] = 'complex-value';

    const result = env('COMPLEX_VAR_NAME_123', 'fallback');

    assert.strictEqual(result, 'complex-value');
  });
});
