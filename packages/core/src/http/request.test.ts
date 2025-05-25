import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRequest, parseCookies, parseQuery } from './request.js';

describe('Request', () => {
  describe('createRequest', () => {
    test('should create a basic request with required fields', () => {
      const req = createRequest({
        method: 'GET',
        url: 'https://example.com/test',
        path: '/test',
      });

      assert.equal(req.method, 'GET');
      assert.equal(req.url, 'https://example.com/test');
      assert.equal(req.path, '/test');
      assert.deepEqual(req.query, {});
      assert.deepEqual(req.params, {});
      assert.deepEqual(req.headers, {});
      assert.deepEqual(req.cookies, {});
      assert.equal(req.ip, '');
      assert.equal(req.userAgent, '');
      assert.equal(req.body, undefined);
    });

    test('should create a request with all optional fields', () => {
      const req = createRequest({
        method: 'POST',
        url: 'https://example.com/users/123?sort=name',
        path: '/users/123',
        query: { sort: 'name' },
        params: { id: '123' },
        headers: { 'content-type': 'application/json' },
        cookies: { session: 'abc123' },
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        body: '{"name": "John"}',
      });

      assert.equal(req.method, 'POST');
      assert.equal(req.url, 'https://example.com/users/123?sort=name');
      assert.equal(req.path, '/users/123');
      assert.deepEqual(req.query, { sort: 'name' });
      assert.deepEqual(req.params, { id: '123' });
      assert.deepEqual(req.headers, { 'content-type': 'application/json' });
      assert.deepEqual(req.cookies, { session: 'abc123' });
      assert.equal(req.ip, '192.168.1.1');
      assert.equal(req.userAgent, 'Mozilla/5.0');
      assert.equal(req.body, '{"name": "John"}');
    });
  });

  describe('json method', () => {
    test('should parse valid JSON body', async () => {
      const req = createRequest({
        method: 'POST',
        url: 'https://example.com/test',
        path: '/test',
        body: '{"name": "John", "age": 30}',
      });

      const data = await req.json();
      assert.deepEqual(data, { name: 'John', age: 30 });
    });

    test('should throw error for invalid JSON', async () => {
      const req = createRequest({
        method: 'POST',
        url: 'https://example.com/test',
        path: '/test',
        body: 'invalid json',
      });

      await assert.rejects(() => req.json(), {
        message: 'Invalid JSON in request body',
      });
    });

    test('should throw error when no body', async () => {
      const req = createRequest({
        method: 'GET',
        url: 'https://example.com/test',
        path: '/test',
      });

      await assert.rejects(() => req.json(), {
        message: 'No body to parse as JSON',
      });
    });
  });

  describe('text method', () => {
    test('should return body as text', async () => {
      const req = createRequest({
        method: 'POST',
        url: 'https://example.com/test',
        path: '/test',
        body: 'Hello, World!',
      });

      const text = await req.text();
      assert.equal(text, 'Hello, World!');
    });

    test('should return empty string when no body', async () => {
      const req = createRequest({
        method: 'GET',
        url: 'https://example.com/test',
        path: '/test',
      });

      const text = await req.text();
      assert.equal(text, '');
    });
  });

  describe('formData method', () => {
    test('should parse form data', async () => {
      const req = createRequest({
        method: 'POST',
        url: 'https://example.com/test',
        path: '/test',
        body: 'name=John&age=30&city=New%20York',
      });

      const data = await req.formData();
      assert.deepEqual(data, {
        name: 'John',
        age: '30',
        city: 'New York',
      });
    });

    test('should handle multiple values for same key', async () => {
      const req = createRequest({
        method: 'POST',
        url: 'https://example.com/test',
        path: '/test',
        body: 'tags=javascript&tags=typescript&tags=node',
      });

      const data = await req.formData();
      assert.deepEqual(data, {
        tags: ['javascript', 'typescript', 'node'],
      });
    });

    test('should return empty object when no body', async () => {
      const req = createRequest({
        method: 'GET',
        url: 'https://example.com/test',
        path: '/test',
      });

      const data = await req.formData();
      assert.deepEqual(data, {});
    });
  });

  describe('buffer method', () => {
    test('should return body as buffer', async () => {
      const req = createRequest({
        method: 'POST',
        url: 'https://example.com/test',
        path: '/test',
        body: 'Hello, World!',
      });

      const buffer = await req.buffer();
      assert.ok(Buffer.isBuffer(buffer));
      assert.equal(buffer.toString(), 'Hello, World!');
    });

    test('should return empty buffer when no body', async () => {
      const req = createRequest({
        method: 'GET',
        url: 'https://example.com/test',
        path: '/test',
      });

      const buffer = await req.buffer();
      assert.ok(Buffer.isBuffer(buffer));
      assert.equal(buffer.length, 0);
    });
  });

  describe('parseCookies', () => {
    test('should parse cookie header', () => {
      const cookies = parseCookies('session=abc123; user=john; theme=dark');
      assert.deepEqual(cookies, {
        session: 'abc123',
        user: 'john',
        theme: 'dark',
      });
    });

    test('should handle cookies with = in value', () => {
      const cookies = parseCookies('data=key=value; token=jwt.token.here');
      assert.deepEqual(cookies, {
        data: 'key=value',
        token: 'jwt.token.here',
      });
    });

    test('should return empty object for empty header', () => {
      assert.deepEqual(parseCookies(''), {});
      assert.deepEqual(parseCookies(undefined), {});
    });

    test('should handle malformed cookies gracefully', () => {
      const cookies = parseCookies('session=abc123; ; user=john; =value');
      assert.deepEqual(cookies, {
        session: 'abc123',
        user: 'john',
      });
    });
  });

  describe('parseQuery', () => {
    test('should parse query string', () => {
      const query = parseQuery('name=John&age=30&city=New%20York');
      assert.deepEqual(query, {
        name: 'John',
        age: '30',
        city: 'New York',
      });
    });

    test('should return empty object for empty query', () => {
      assert.deepEqual(parseQuery(''), {});
      assert.deepEqual(parseQuery(undefined), {});
    });

    test('should handle query without values', () => {
      const query = parseQuery('debug&verbose=true');
      assert.deepEqual(query, {
        debug: '',
        verbose: 'true',
      });
    });
  });
});
