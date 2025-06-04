import { test, describe, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import {
  scanRoutes,
  expandRoutesToMethods,
  scanSubscribers,
} from '../project/route-scanner.js';

describe('Build Command Route Scanning', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = await fs.mkdtemp('/tmp/lumo-test-');
    originalCwd = process.cwd();
    process.chdir(testDir);

    // Create base directory structure
    await fs.mkdir('functions/api', { recursive: true });
    await fs.mkdir('functions/subscribers', { recursive: true });
  });

  afterEach(async () => {
    // Clean up
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function createTestFiles(files: Record<string, string>) {
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(testDir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
    }
  }

  test('should scan simple index.ts with GET export', async () => {
    await createTestFiles({
      'functions/api/index.ts': `
import { response, statusCodes, type Request } from '@lumo-framework/core';

export async function GET(req: Request) {
  return response(statusCodes.OK, { message: 'Hello from root' });
}
`,
    });

    const routes = await scanRoutes();
    assert.equal(routes.length, 1);
    assert.equal(routes[0].route, '/');
    assert.deepEqual(routes[0].methods, ['GET']);
    assert.deepEqual(routes[0].exports, ['GET']);

    const methodRoutes = expandRoutesToMethods(routes);
    assert.equal(methodRoutes.length, 1);
    assert.equal(methodRoutes[0].method, 'GET');
    assert.equal(methodRoutes[0].route, '/');
  });

  test('should scan users directory with index.ts (GET, POST)', async () => {
    await createTestFiles({
      'functions/api/users/index.ts': `
import { response, statusCodes, type Request } from '@lumo-framework/core';

export async function GET(req: Request) {
  return response(statusCodes.OK, { users: [] });
}

export async function POST(req: Request) {
  const data = await req.json();
  return response(statusCodes.CREATED, { user: data });
}
`,
    });

    const routes = await scanRoutes();
    assert.equal(routes.length, 1);
    assert.equal(routes[0].route, '/users');
    assert.deepEqual(routes[0].methods, ['GET', 'POST']);
    assert.ok(routes[0].exports.includes('GET'));
    assert.ok(routes[0].exports.includes('POST'));

    const methodRoutes = expandRoutesToMethods(routes);
    assert.equal(methodRoutes.length, 2);

    const getMethods = methodRoutes.filter((r) => r.method === 'GET');
    const postMethods = methodRoutes.filter((r) => r.method === 'POST');
    assert.equal(getMethods.length, 1);
    assert.equal(postMethods.length, 1);
    assert.equal(getMethods[0].route, '/users');
    assert.equal(postMethods[0].route, '/users');
  });

  test('should scan users create.ts with POST export', async () => {
    await createTestFiles({
      'functions/api/users/create.ts': `
import { response, statusCodes, type Request } from '@lumo-framework/core';

export async function POST(req: Request) {
  const userData = await req.json();
  return response(statusCodes.CREATED, { id: 1, ...userData });
}
`,
    });

    const routes = await scanRoutes();
    assert.equal(routes.length, 1);
    assert.equal(routes[0].route, '/users');
    assert.deepEqual(routes[0].methods, ['POST']);
    assert.deepEqual(routes[0].exports, ['POST']);

    const methodRoutes = expandRoutesToMethods(routes);
    assert.equal(methodRoutes.length, 1);
    assert.equal(methodRoutes[0].method, 'POST');
    assert.equal(methodRoutes[0].route, '/users');
  });

  test('should scan products with multiple HTTP methods', async () => {
    await createTestFiles({
      'functions/api/products/[id].ts': `
import { response, statusCodes, type Request } from '@lumo-framework/core';

export async function GET(req: Request) {
  return response(statusCodes.OK, { product: { id: req.params.id } });
}

export async function PUT(req: Request) {
  const data = await req.json();
  return response(statusCodes.OK, { id: req.params.id, ...data });
}

export async function DELETE(req: Request) {
  return response(statusCodes.NO_CONTENT);
}
`,
    });

    const routes = await scanRoutes();
    assert.equal(routes.length, 1);
    assert.equal(routes[0].route, '/products/[id]');
    assert.deepEqual(routes[0].methods, ['GET', 'PUT', 'DELETE']);

    const methodRoutes = expandRoutesToMethods(routes);
    assert.equal(methodRoutes.length, 3);

    const methods = methodRoutes.map((r) => r.method).sort();
    assert.deepEqual(methods, ['DELETE', 'GET', 'PUT']);
    assert.ok(methodRoutes.every((r) => r.route === '/products/[id]'));
  });

  test('should scan route with default export handler', async () => {
    await createTestFiles({
      'functions/api/fallback.ts': `
import { response, statusCodes, type Request } from '@lumo-framework/core';

export default async function handler(req: Request) {
  return response(statusCodes.OK, { method: req.method, path: req.path });
}
`,
    });

    const routes = await scanRoutes();
    assert.equal(routes.length, 1);
    assert.equal(routes[0].route, '/fallback');
    assert.deepEqual(routes[0].methods, ['ALL']);
    assert.equal(routes[0].hasDefaultExport, true);

    const methodRoutes = expandRoutesToMethods(routes);
    assert.equal(methodRoutes.length, 1);
    assert.equal(methodRoutes[0].method, 'ALL');
    assert.equal(methodRoutes[0].exportName, 'default');
  });

  test('should scan route with named handler export', async () => {
    await createTestFiles({
      'functions/api/webhook.ts': `
import { response, statusCodes, type Request } from '@lumo-framework/core';

export async function handler(req: Request) {
  return response(statusCodes.OK, { webhook: 'received' });
}
`,
    });

    const routes = await scanRoutes();
    assert.equal(routes.length, 1);
    assert.equal(routes[0].route, '/webhook');
    assert.deepEqual(routes[0].methods, ['ALL']);
    assert.ok(routes[0].exports.includes('handler'));

    const methodRoutes = expandRoutesToMethods(routes);
    assert.equal(methodRoutes.length, 1);
    assert.equal(methodRoutes[0].method, 'ALL');
    assert.equal(methodRoutes[0].exportName, 'handler');
  });

  test('should scan nested directory structures', async () => {
    await createTestFiles({
      'functions/api/admin/users/permissions.ts': `
import { response, statusCodes, type Request } from '@lumo-framework/core';

export async function GET(req: Request) {
  return response(statusCodes.OK, { permissions: [] });
}

export async function PATCH(req: Request) {
  return response(statusCodes.OK, { updated: true });
}
`,
    });

    const routes = await scanRoutes();
    assert.equal(routes.length, 1);
    assert.equal(routes[0].route, '/admin/users/permissions');
    assert.deepEqual(routes[0].methods, ['GET', 'PATCH']);

    const methodRoutes = expandRoutesToMethods(routes);
    assert.equal(methodRoutes.length, 2);
    assert.ok(
      methodRoutes.every((r) => r.route === '/admin/users/permissions')
    );

    const methods = methodRoutes.map((r) => r.method).sort();
    assert.deepEqual(methods, ['GET', 'PATCH']);
  });

  test('should consolidate multiple files in same directory to single route', async () => {
    await createTestFiles({
      'functions/api/users/index.ts': `
export async function GET(req: Request) {
  return response(statusCodes.OK, { users: [] });
}
`,
      'functions/api/users/create.ts': `
export async function POST(req: Request) {
  return response(statusCodes.CREATED, { user: {} });
}
`,
    });

    const routes = await scanRoutes();
    assert.equal(routes.length, 1); // Should consolidate to single /users route
    assert.equal(routes[0].route, '/users');
    assert.deepEqual(routes[0].methods.sort(), ['GET', 'POST']);
    assert.ok(routes[0].exports.includes('GET'));
    assert.ok(routes[0].exports.includes('POST'));

    const methodRoutes = expandRoutesToMethods(routes);
    assert.equal(methodRoutes.length, 2); // GET and POST

    const getMethods = methodRoutes.filter((r) => r.method === 'GET');
    const postMethods = methodRoutes.filter((r) => r.method === 'POST');
    assert.equal(getMethods.length, 1);
    assert.equal(postMethods.length, 1);
    assert.equal(getMethods[0].route, '/users');
    assert.equal(postMethods[0].route, '/users');

    // Verify correct files are used for each method
    assert.ok(getMethods[0].file.includes('index.ts'));
    assert.ok(postMethods[0].file.includes('create.ts'));
  });

  test('should handle dynamic routes separately from method files', async () => {
    await createTestFiles({
      'functions/api/users/index.ts': `
export async function GET(req: Request) {
  return response(statusCodes.OK, { users: [] });
}
`,
      'functions/api/users/create.ts': `
export async function POST(req: Request) {
  return response(statusCodes.CREATED, { user: {} });
}
`,
      'functions/api/users/[id].ts': `
export async function GET(req: Request) {
  return response(statusCodes.OK, { user: {} });
}

export async function DELETE(req: Request) {
  return response(statusCodes.NO_CONTENT);
}
`,
    });

    const routes = await scanRoutes();
    assert.equal(routes.length, 2); // /users and /users/[id]

    const routePaths = routes.map((r) => r.route).sort();
    assert.deepEqual(routePaths, ['/users', '/users/[id]']);

    // Check the consolidated /users route
    const usersRoute = routes.find((r) => r.route === '/users');
    assert.ok(usersRoute);
    assert.deepEqual(usersRoute.methods.sort(), ['GET', 'POST']);

    // Check the dynamic route
    const dynamicRoute = routes.find((r) => r.route === '/users/[id]');
    assert.ok(dynamicRoute);
    assert.deepEqual(dynamicRoute.methods.sort(), ['DELETE', 'GET']);

    const methodRoutes = expandRoutesToMethods(routes);
    assert.equal(methodRoutes.length, 4); // GET, POST, GET, DELETE
  });

  test('should scan subscribers', async () => {
    await createTestFiles({
      'functions/subscribers/user-created.ts': `
export async function listen(event: any) {
  console.log('User created:', event);
}
`,
      'functions/subscribers/order-processed.ts': `
export async function listen(event: any) {
  console.log('Order processed:', event);
}
`,
    });

    const subscribers = await scanSubscribers();
    assert.equal(subscribers.length, 2);

    const names = subscribers.map((s) => s.name).sort();
    assert.deepEqual(names, ['order-processed', 'user-created']);

    assert.ok(subscribers.every((s) => s.exports.includes('listen')));
  });

  test('should handle empty directories gracefully', async () => {
    // Create empty directories
    await fs.mkdir('functions/api/empty', { recursive: true });
    await fs.mkdir('functions/subscribers/empty', { recursive: true });

    const routes = await scanRoutes();
    assert.equal(routes.length, 0);

    const subscribers = await scanSubscribers();
    assert.equal(subscribers.length, 0);
  });

  test('should handle files with no valid exports', async () => {
    await createTestFiles({
      'functions/api/invalid.ts': `
// This file has no valid exports
const someConstant = 'value';
function privateFunction() {
  return 'private';
}
`,
      'functions/api/valid.ts': `
export async function GET(req: Request) {
  return response(statusCodes.OK, {});
}
`,
    });

    const routes = await scanRoutes();
    assert.equal(routes.length, 1); // Only the valid file should be included
    assert.equal(routes[0].route, '/valid');
  });

  test('should handle complex nested structures', async () => {
    await createTestFiles({
      'functions/api/v1/users/index.ts': `export async function GET() {}`,
      'functions/api/v1/users/[id]/index.ts': `export async function GET() {}`,
      'functions/api/v1/users/[id]/posts/index.ts': `export async function GET() {}`,
      'functions/api/v2/admin/reports.ts': `export async function POST() {}`,
    });

    const routes = await scanRoutes();
    assert.equal(routes.length, 4);

    const routePaths = routes.map((r) => r.route).sort();
    assert.deepEqual(routePaths, [
      '/v1/users',
      '/v1/users/[id]',
      '/v1/users/[id]/posts',
      '/v2/admin/reports',
    ]);
  });
});
