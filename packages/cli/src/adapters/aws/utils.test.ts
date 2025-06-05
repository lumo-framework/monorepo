import { test } from 'node:test';
import assert from 'node:assert';
import { toPascalCase } from './utils.js';

test('toPascalCase converts kebab-case to PascalCase', () => {
  assert.strictEqual(toPascalCase('hello-world'), 'HelloWorld');
  assert.strictEqual(toPascalCase('my-project-name'), 'MyProjectName');
  assert.strictEqual(toPascalCase('api-gateway'), 'ApiGateway');
});

test('toPascalCase converts snake_case to PascalCase', () => {
  assert.strictEqual(toPascalCase('hello_world'), 'HelloWorld');
  assert.strictEqual(toPascalCase('my_project_name'), 'MyProjectName');
  assert.strictEqual(toPascalCase('user_profile'), 'UserProfile');
});

test('toPascalCase converts space-separated to PascalCase', () => {
  assert.strictEqual(toPascalCase('hello world'), 'HelloWorld');
  assert.strictEqual(toPascalCase('my project name'), 'MyProjectName');
  assert.strictEqual(toPascalCase('user profile'), 'UserProfile');
});

test('toPascalCase handles mixed separators', () => {
  assert.strictEqual(
    toPascalCase('hello-world_test name'),
    'HelloWorldTestName'
  );
  assert.strictEqual(
    toPascalCase('api_gateway-service test'),
    'ApiGatewayServiceTest'
  );
});

test('toPascalCase handles single words', () => {
  assert.strictEqual(toPascalCase('hello'), 'Hello');
  assert.strictEqual(toPascalCase('api'), 'Api');
  assert.strictEqual(toPascalCase('user'), 'User');
});

test('toPascalCase handles already PascalCase strings', () => {
  assert.strictEqual(toPascalCase('HelloWorld'), 'HelloWorld');
  assert.strictEqual(toPascalCase('ApiGateway'), 'ApiGateway');
});

test('toPascalCase handles empty string', () => {
  assert.strictEqual(toPascalCase(''), '');
});

test('toPascalCase handles strings with numbers', () => {
  assert.strictEqual(toPascalCase('api-v1'), 'ApiV1');
  assert.strictEqual(toPascalCase('user_service_2'), 'UserService2');
  assert.strictEqual(toPascalCase('hello world 123'), 'HelloWorld123');
});

test('toPascalCase handles consecutive separators', () => {
  assert.strictEqual(toPascalCase('hello--world'), 'HelloWorld');
  assert.strictEqual(toPascalCase('api__gateway'), 'ApiGateway');
  assert.strictEqual(toPascalCase('user  profile'), 'UserProfile');
});

test('toPascalCase handles leading/trailing separators', () => {
  assert.strictEqual(toPascalCase('-hello-world-'), 'HelloWorld');
  assert.strictEqual(toPascalCase('_api_gateway_'), 'ApiGateway');
  assert.strictEqual(toPascalCase(' user profile '), 'UserProfile');
});
