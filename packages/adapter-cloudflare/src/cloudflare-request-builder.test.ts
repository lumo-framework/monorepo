import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildRequestFromCloudflare,
  isCloudflareRequest,
} from './cloudflare-request-builder.js';

// Mock ExecutionContext for testing
const mockExecutionContext = {
  waitUntil: () => {},
  passThroughOnException: () => {},
};

describe('Cloudflare Request Builder', () => {
  describe('buildRequestFromCloudflare', () => {
    it('should use X-Original-URL header when present', () => {
      const workerUrl = 'https://worker.example.workers.dev/some-path';
      const originalUrl = 'https://api.example.com/users/123?test=value';

      const mockHeaders = new Headers();
      mockHeaders.set('X-Original-URL', originalUrl);
      mockHeaders.set('User-Agent', 'test-agent');

      const mockRequest = {
        method: 'GET',
        url: workerUrl,
        headers: mockHeaders,
      } as globalThis.Request;

      const result = buildRequestFromCloudflare(
        mockRequest,
        {},
        mockExecutionContext
      );

      assert.strictEqual(result.url, originalUrl);
      assert.strictEqual(result.path, '/users/123');
      assert.deepStrictEqual(result.query, { test: 'value' });
    });

    it('should fallback to request.url when X-Original-URL header is not present', () => {
      const requestUrl = 'https://worker.example.workers.dev/test?param=value';

      const mockHeaders = new Headers();
      mockHeaders.set('User-Agent', 'test-agent');

      const mockRequest = {
        method: 'POST',
        url: requestUrl,
        headers: mockHeaders,
      } as globalThis.Request;

      const result = buildRequestFromCloudflare(
        mockRequest,
        {},
        mockExecutionContext
      );

      assert.strictEqual(result.url, requestUrl);
      assert.strictEqual(result.path, '/test');
      assert.deepStrictEqual(result.query, { param: 'value' });
    });

    it('should preserve all headers including X-Original-URL', () => {
      const workerUrl = 'https://worker.example.workers.dev/';
      const originalUrl = 'https://api.example.com/';

      const mockHeaders = new Headers();
      mockHeaders.set('X-Original-URL', originalUrl);
      mockHeaders.set('Authorization', 'Bearer token123');
      mockHeaders.set('Content-Type', 'application/json');

      const mockRequest = {
        method: 'GET',
        url: workerUrl,
        headers: mockHeaders,
      } as globalThis.Request;

      const result = buildRequestFromCloudflare(
        mockRequest,
        {},
        mockExecutionContext
      );

      assert.strictEqual(result.headers['x-original-url'], originalUrl);
      assert.strictEqual(result.headers['authorization'], 'Bearer token123');
      assert.strictEqual(result.headers['content-type'], 'application/json');
    });

    it('should extract path parameters from X-Path-Params header', () => {
      const originalUrl = 'https://api.example.com/users/123/posts/456';
      const pathParams = { userId: '123', postId: '456' };

      const mockHeaders = new Headers();
      mockHeaders.set('X-Original-URL', originalUrl);
      mockHeaders.set('X-Path-Params', JSON.stringify(pathParams));

      const mockRequest = {
        method: 'GET',
        url: 'https://worker.example.workers.dev/',
        headers: mockHeaders,
      } as globalThis.Request;

      const result = buildRequestFromCloudflare(
        mockRequest,
        {},
        mockExecutionContext
      );

      assert.deepStrictEqual(result.params, pathParams);
    });

    it('should handle empty path parameters when header is not present', () => {
      const originalUrl = 'https://api.example.com/users';

      const mockHeaders = new Headers();
      mockHeaders.set('X-Original-URL', originalUrl);

      const mockRequest = {
        method: 'GET',
        url: 'https://worker.example.workers.dev/',
        headers: mockHeaders,
      } as globalThis.Request;

      const result = buildRequestFromCloudflare(
        mockRequest,
        {},
        mockExecutionContext
      );

      assert.deepStrictEqual(result.params, {});
    });

    it('should handle malformed X-Path-Params header gracefully', () => {
      const originalUrl = 'https://api.example.com/users/123';

      const mockHeaders = new Headers();
      mockHeaders.set('X-Original-URL', originalUrl);
      mockHeaders.set('X-Path-Params', 'invalid-json');

      const mockRequest = {
        method: 'GET',
        url: 'https://worker.example.workers.dev/',
        headers: mockHeaders,
      } as globalThis.Request;

      const result = buildRequestFromCloudflare(
        mockRequest,
        {},
        mockExecutionContext
      );

      assert.deepStrictEqual(result.params, {});
    });

    it('should preserve path parameters along with other request properties', () => {
      const originalUrl = 'https://api.example.com/users/123?include=posts';
      const pathParams = { userId: '123' };

      const mockHeaders = new Headers();
      mockHeaders.set('X-Original-URL', originalUrl);
      mockHeaders.set('X-Path-Params', JSON.stringify(pathParams));
      mockHeaders.set('Authorization', 'Bearer token');

      const mockRequest = {
        method: 'GET',
        url: 'https://worker.example.workers.dev/',
        headers: mockHeaders,
      } as globalThis.Request;

      const result = buildRequestFromCloudflare(
        mockRequest,
        {},
        mockExecutionContext
      );

      assert.strictEqual(result.method, 'GET');
      assert.strictEqual(result.url, originalUrl);
      assert.strictEqual(result.path, '/users/123');
      assert.deepStrictEqual(result.query, { include: 'posts' });
      assert.deepStrictEqual(result.params, pathParams);
      assert.strictEqual(result.headers['authorization'], 'Bearer token');
    });
  });

  describe('isCloudflareRequest', () => {
    it('should return true for valid Request-like object', () => {
      const mockRequest = {
        method: 'GET',
        url: 'https://example.com',
        headers: new Map(),
      };

      assert.strictEqual(isCloudflareRequest(mockRequest), true);
    });

    it('should return false for invalid objects', () => {
      assert.strictEqual(isCloudflareRequest(null), false);
      assert.strictEqual(isCloudflareRequest(undefined), false);
      assert.strictEqual(isCloudflareRequest({}), false);
      assert.strictEqual(isCloudflareRequest({ method: 'GET' }), false);
    });
  });
});
