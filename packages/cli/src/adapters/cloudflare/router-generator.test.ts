import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractRouteInfo } from './router-generator.js';

describe('Cloudflare Router Generator', () => {
  describe('extractRouteInfo', () => {
    it('should extract route info for basic routes', () => {
      const routes = [
        { name: '/users/route-get' },
        { name: '/posts/route-post' },
      ];

      const result = extractRouteInfo(routes);

      assert.strictEqual(result.length, 2);

      const usersRoute = result.find((r) => r.path === '/users');
      assert.ok(usersRoute);
      assert.strictEqual(usersRoute.method, 'GET');
      assert.strictEqual(usersRoute.pathPattern, '/users');
      assert.deepStrictEqual(usersRoute.paramNames, []);

      const postsRoute = result.find((r) => r.path === '/posts');
      assert.ok(postsRoute);
      assert.strictEqual(postsRoute.method, 'POST');
      assert.strictEqual(postsRoute.pathPattern, '/posts');
      assert.deepStrictEqual(postsRoute.paramNames, []);
    });

    it('should extract route info for dynamic parameter routes', () => {
      const routes = [
        { name: '/users/[id]/route-get' },
        { name: '/users/[userId]/posts/[postId]/route-delete' },
      ];

      const result = extractRouteInfo(routes);

      assert.strictEqual(result.length, 2);

      const userRoute = result.find((r) => r.path === '/users/[id]');
      assert.ok(userRoute);
      assert.strictEqual(userRoute.method, 'GET');
      assert.strictEqual(userRoute.pathPattern, '/users/:id');
      assert.deepStrictEqual(userRoute.paramNames, ['id']);

      const userPostRoute = result.find(
        (r) => r.path === '/users/[userId]/posts/[postId]'
      );
      assert.ok(userPostRoute);
      assert.strictEqual(userPostRoute.method, 'DELETE');
      assert.strictEqual(
        userPostRoute.pathPattern,
        '/users/:userId/posts/:postId'
      );
      assert.deepStrictEqual(userPostRoute.paramNames, ['userId', 'postId']);
    });

    it('should handle mixed static and dynamic routes', () => {
      const routes = [
        { name: '/users/route-get' },
        { name: '/users/[id]/route-get' },
        { name: '/users/[id]/profile/route-patch' },
      ];

      const result = extractRouteInfo(routes);

      assert.strictEqual(result.length, 3);

      // Static route
      const staticRoute = result.find(
        (r) => r.path === '/users' && r.method === 'GET'
      );
      assert.ok(staticRoute);
      assert.strictEqual(staticRoute.pathPattern, '/users');
      assert.deepStrictEqual(staticRoute.paramNames, []);

      // Dynamic route
      const dynamicRoute = result.find(
        (r) => r.path === '/users/[id]' && r.method === 'GET'
      );
      assert.ok(dynamicRoute);
      assert.strictEqual(dynamicRoute.pathPattern, '/users/:id');
      assert.deepStrictEqual(dynamicRoute.paramNames, ['id']);

      // Nested dynamic route
      const nestedRoute = result.find((r) => r.path === '/users/[id]/profile');
      assert.ok(nestedRoute);
      assert.strictEqual(nestedRoute.pathPattern, '/users/:id/profile');
      assert.deepStrictEqual(nestedRoute.paramNames, ['id']);
    });

    it('should handle root route', () => {
      const routes = [{ name: '/route-get' }];

      const result = extractRouteInfo(routes);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].path, '/');
      assert.strictEqual(result[0].pathPattern, '/');
      assert.deepStrictEqual(result[0].paramNames, []);
      assert.strictEqual(result[0].method, 'GET');
    });

    it('should handle complex parameter names', () => {
      const routes = [
        { name: '/organizations/[orgId]/projects/[projectSlug]/route-get' },
      ];

      const result = extractRouteInfo(routes);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(
        result[0].path,
        '/organizations/[orgId]/projects/[projectSlug]'
      );
      assert.strictEqual(
        result[0].pathPattern,
        '/organizations/:orgId/projects/:projectSlug'
      );
      assert.deepStrictEqual(result[0].paramNames, ['orgId', 'projectSlug']);
      assert.strictEqual(result[0].method, 'GET');
    });

    it('should generate correct function names and handler functions', () => {
      const routes = [{ name: '/users/[id]/posts/[postId]/route-get' }];

      const result = extractRouteInfo(routes);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(
        result[0].functionName,
        '/users/[id]/posts/[postId]/route-get'
      );
      assert.strictEqual(
        result[0].handlerFunction,
        '/users/[id]/posts/[postId]/route_get_handler'
      );
    });
  });
});
