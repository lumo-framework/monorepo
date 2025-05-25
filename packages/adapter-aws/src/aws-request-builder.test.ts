import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import {
  buildRequestFromApiGateway,
  isApiGatewayProxyEvent,
} from './aws-request-builder.js';

// Helper to create a basic API Gateway event
const createApiGatewayEvent = (
  overrides: Partial<APIGatewayProxyEvent> = {}
): APIGatewayProxyEvent => ({
  httpMethod: 'GET',
  path: '/test',
  pathParameters: null,
  queryStringParameters: null,
  headers: {
    Host: 'api.example.com',
    'User-Agent': 'Mozilla/5.0 Test Browser',
  },
  multiValueHeaders: {},
  multiValueQueryStringParameters: null,
  body: null,
  isBase64Encoded: false,
  requestContext: {
    accountId: '123456789',
    apiId: 'api123',
    protocol: 'HTTP/1.1',
    httpMethod: 'GET',
    path: '/test',
    stage: 'prod',
    requestId: 'req-123',
    requestTime: '09/Apr/2015:12:34:56 +0000',
    requestTimeEpoch: 1428582896000,
    identity: {
      cognitoIdentityPoolId: null,
      accountId: null,
      cognitoIdentityId: null,
      caller: null,
      sourceIp: '127.0.0.1',
      principalOrgId: null,
      accessKey: null,
      cognitoAuthenticationType: null,
      cognitoAuthenticationProvider: null,
      userArn: null,
      userAgent: 'Custom User Agent String',
      user: null,
      apiKey: null,
      apiKeyId: null,
      clientCert: null,
    },
    resourceId: 'resource123',
    resourcePath: '/test',
    authorizer: null,
  },
  resource: '/test',
  stageVariables: null,
  ...overrides,
});

describe('AWS Request Builder', () => {
  describe('buildRequestFromApiGateway', () => {
    test('should build basic request from minimal event', () => {
      const event = createApiGatewayEvent();
      const request = buildRequestFromApiGateway(event);

      assert.equal(request.method, 'GET');
      assert.equal(request.path, '/test');
      assert.equal(request.url, 'https://api.example.com/test');
      assert.deepEqual(request.query, {});
      assert.deepEqual(request.params, {});
      assert.equal(request.headers['Host'], 'api.example.com');
      assert.equal(request.userAgent, 'Mozilla/5.0 Test Browser');
      assert.equal(request.ip, '');
      assert.deepEqual(request.cookies, {});
      assert.equal(request.body, undefined);
    });

    test('should handle POST request with body', async () => {
      const event = createApiGatewayEvent({
        httpMethod: 'POST',
        headers: {
          Host: 'api.example.com',
          'Content-Type': 'application/json',
          'User-Agent': 'Test Client',
        },
        body: '{"name": "John", "age": 30}',
      });

      const request = buildRequestFromApiGateway(event);

      assert.equal(request.method, 'POST');
      assert.equal(request.headers['Content-Type'], 'application/json');
      assert.equal(request.body, '{"name": "John", "age": 30}');

      const data = await request.json();
      assert.deepEqual(data, { name: 'John', age: 30 });
    });

    test('should parse query parameters correctly', () => {
      const event = createApiGatewayEvent({
        path: '/search',
        queryStringParameters: {
          q: 'javascript',
          page: '2',
          sort: 'date',
        },
      });

      const request = buildRequestFromApiGateway(event);

      assert.equal(request.path, '/search');
      assert.equal(
        request.url,
        'https://api.example.com/search?q=javascript&page=2&sort=date'
      );
      assert.deepEqual(request.query, {
        q: 'javascript',
        page: '2',
        sort: 'date',
      });
    });

    test('should handle path parameters', () => {
      const event = createApiGatewayEvent({
        path: '/users/123/posts/456',
        pathParameters: {
          userId: '123',
          postId: '456',
        },
      });

      const request = buildRequestFromApiGateway(event);

      assert.equal(request.path, '/users/123/posts/456');
      assert.deepEqual(request.params, {
        userId: '123',
        postId: '456',
      });
    });

    test('should parse cookies from Cookie header', () => {
      const event = createApiGatewayEvent({
        headers: {
          Host: 'api.example.com',
          Cookie: 'session=abc123; theme=dark; user=john',
          'User-Agent': 'Test Browser',
        },
      });

      const request = buildRequestFromApiGateway(event);

      assert.deepEqual(request.cookies, {
        session: 'abc123',
        theme: 'dark',
        user: 'john',
      });
    });

    test('should extract client IP from X-Forwarded-For', () => {
      const event = createApiGatewayEvent({
        headers: {
          Host: 'api.example.com',
          'X-Forwarded-For': '203.0.113.195, 70.41.3.18, 150.172.238.178',
          'User-Agent': 'Test Browser',
        },
      });

      const request = buildRequestFromApiGateway(event);

      assert.equal(request.ip, '203.0.113.195');
    });

    test('should extract client IP from alternative headers', () => {
      const event1 = createApiGatewayEvent({
        headers: {
          Host: 'api.example.com',
          'X-Real-IP': '192.168.1.100',
          'User-Agent': 'Test Browser',
        },
      });

      const event2 = createApiGatewayEvent({
        headers: {
          Host: 'api.example.com',
          'X-Client-IP': '10.0.0.50',
          'User-Agent': 'Test Browser',
        },
      });

      assert.equal(buildRequestFromApiGateway(event1).ip, '192.168.1.100');
      assert.equal(buildRequestFromApiGateway(event2).ip, '10.0.0.50');
    });

    test('should handle missing headers gracefully', () => {
      const event = createApiGatewayEvent({
        headers: {} as Record<string, string>,
      });

      const request = buildRequestFromApiGateway(event);

      assert.equal(request.url, 'https://localhost/test');
      assert.equal(request.userAgent, '');
      assert.equal(request.ip, '');
      assert.deepEqual(request.cookies, {});
    });

    test('should filter out undefined header values', () => {
      const event = createApiGatewayEvent({
        headers: {
          Host: 'api.example.com',
          'X-Custom': 'value',
          'X-Undefined': undefined as string | undefined,
          'User-Agent': 'Test Browser',
        },
      });

      const request = buildRequestFromApiGateway(event);

      assert.equal(request.headers['Host'], 'api.example.com');
      assert.equal(request.headers['X-Custom'], 'value');
      assert.equal(request.headers['X-Undefined'], undefined);
    });

    test('should filter out null/undefined query parameters', () => {
      const event = createApiGatewayEvent({
        queryStringParameters: {
          valid: 'value',
          null_param: null as any,
          undefined_param: undefined as string | undefined,
        },
      });

      const request = buildRequestFromApiGateway(event);

      assert.deepEqual(request.query, {
        valid: 'value',
      });
      assert.equal(request.url, 'https://api.example.com/test?valid=value');
    });

    test('should filter out undefined path parameters', () => {
      const event = createApiGatewayEvent({
        pathParameters: {
          id: '123',
          undefined_param: undefined as string | undefined,
        },
      });

      const request = buildRequestFromApiGateway(event);

      assert.deepEqual(request.params, {
        id: '123',
      });
    });

    test('should handle different protocols from X-Forwarded-Proto', () => {
      const httpEvent = createApiGatewayEvent({
        headers: {
          Host: 'api.example.com',
          'X-Forwarded-Proto': 'http',
          'User-Agent': 'Test Browser',
        },
      });

      const httpsEvent = createApiGatewayEvent({
        headers: {
          Host: 'api.example.com',
          'X-Forwarded-Proto': 'https',
          'User-Agent': 'Test Browser',
        },
      });

      assert.equal(
        buildRequestFromApiGateway(httpEvent).url,
        'http://api.example.com/test'
      );
      assert.equal(
        buildRequestFromApiGateway(httpsEvent).url,
        'https://api.example.com/test'
      );
    });

    test('should handle form data body', async () => {
      const event = createApiGatewayEvent({
        httpMethod: 'POST',
        headers: {
          Host: 'api.example.com',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Test Browser',
        },
        body: 'name=John&email=john%40example.com&tags=js&tags=node',
      });

      const request = buildRequestFromApiGateway(event);
      const formData = await request.formData();

      assert.deepEqual(formData, {
        name: 'John',
        email: 'john@example.com',
        tags: ['js', 'node'],
      });
    });

    test('should handle text body', async () => {
      const event = createApiGatewayEvent({
        httpMethod: 'POST',
        headers: {
          Host: 'api.example.com',
          'Content-Type': 'text/plain',
          'User-Agent': 'Test Browser',
        },
        body: 'Hello, World!',
      });

      const request = buildRequestFromApiGateway(event);
      const text = await request.text();

      assert.equal(text, 'Hello, World!');
    });

    test('should handle buffer body', async () => {
      const event = createApiGatewayEvent({
        httpMethod: 'POST',
        headers: {
          Host: 'api.example.com',
          'User-Agent': 'Test Browser',
        },
        body: 'binary data',
      });

      const request = buildRequestFromApiGateway(event);
      const buffer = await request.buffer();

      assert.ok(Buffer.isBuffer(buffer));
      assert.equal(buffer.toString(), 'binary data');
    });
  });

  describe('isApiGatewayProxyEvent', () => {
    test('should return true for valid API Gateway event', () => {
      const event = createApiGatewayEvent();
      assert.equal(isApiGatewayProxyEvent(event), true);
    });

    test('should return false for invalid objects', () => {
      assert.equal(isApiGatewayProxyEvent(null), false);
      assert.equal(isApiGatewayProxyEvent(undefined), false);
      assert.equal(isApiGatewayProxyEvent('string'), false);
      assert.equal(isApiGatewayProxyEvent(123), false);
      assert.equal(isApiGatewayProxyEvent({}), false);
      assert.equal(isApiGatewayProxyEvent({ httpMethod: 'GET' }), false);
      assert.equal(isApiGatewayProxyEvent({ path: '/test' }), false);
    });

    test('should return true for minimal valid event', () => {
      const minimalEvent = {
        httpMethod: 'GET',
        path: '/test',
        headers: {},
      };
      assert.equal(isApiGatewayProxyEvent(minimalEvent), true);
    });
  });
});
