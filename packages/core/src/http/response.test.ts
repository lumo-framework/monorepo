import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { 
    response, 
    STATUS_OK, 
    STATUS_CREATED, 
    STATUS_BAD_REQUEST, 
    STATUS_INTERNAL_SERVER_ERROR,
    type CookieOptions 
} from './response.js';

describe('Response', () => {
    describe('response factory', () => {
        test('should create response with default status 200', () => {
            const res = response();
            
            assert.equal(res.statusCode, STATUS_OK);
            assert.deepEqual(res.headers, { 'Content-Type': 'text/plain' });
            assert.equal(res.body, '');
        });

        test('should create response with custom status', () => {
            const res = response(STATUS_CREATED);
            
            assert.equal(res.statusCode, STATUS_CREATED);
            assert.deepEqual(res.headers, { 'Content-Type': 'text/plain' });
            assert.equal(res.body, '');
        });
    });

    describe('json method', () => {
        test('should set JSON content type and body', () => {
            const res = response().json({ message: 'Hello', count: 42 });
            
            assert.equal(res.headers['Content-Type'], 'application/json');
            assert.equal(res.body, '{"message":"Hello","count":42}');
        });

        test('should handle string data', () => {
            const res = response().json('Hello World');
            
            assert.equal(res.headers['Content-Type'], 'application/json');
            assert.equal(res.body, '"Hello World"');
        });

        test('should be chainable', () => {
            const res = response()
                .json({ data: 'test' })
                .header('X-Custom', 'value');
            
            assert.equal(res.headers['Content-Type'], 'application/json');
            assert.equal(res.headers['X-Custom'], 'value');
            assert.equal(res.body, '{"data":"test"}');
        });
    });

    describe('html method', () => {
        test('should set HTML content type and body', () => {
            const htmlContent = '<html><body><h1>Hello</h1></body></html>';
            const res = response().html(htmlContent);
            
            assert.equal(res.headers['Content-Type'], 'text/html');
            assert.equal(res.body, htmlContent);
        });

        test('should be chainable', () => {
            const res = response()
                .html('<h1>Title</h1>')
                .header('X-Page', 'home');
            
            assert.equal(res.headers['Content-Type'], 'text/html');
            assert.equal(res.headers['X-Page'], 'home');
            assert.equal(res.body, '<h1>Title</h1>');
        });
    });

    describe('redirect method', () => {
        test('should set redirect with default 302 status', () => {
            const res = response().redirect('https://example.com');
            
            assert.equal(res.statusCode, 302);
            assert.equal(res.headers['Location'], 'https://example.com');
            assert.equal(res.body, '');
        });

        test('should set redirect with custom status', () => {
            const res = response().redirect('https://example.com', 301);
            
            assert.equal(res.statusCode, 301);
            assert.equal(res.headers['Location'], 'https://example.com');
            assert.equal(res.body, '');
        });

        test('should be chainable', () => {
            const res = response()
                .redirect('/login')
                .header('X-Reason', 'unauthorized');
            
            assert.equal(res.statusCode, 302);
            assert.equal(res.headers['Location'], '/login');
            assert.equal(res.headers['X-Reason'], 'unauthorized');
        });
    });

    describe('cookie method', () => {
        test('should set simple cookie', () => {
            const res = response().cookie('session', 'abc123');
            
            assert.equal(res.headers['Set-Cookie'], 'session=abc123');
        });

        test('should set cookie with options', () => {
            const options: CookieOptions = {
                maxAge: 3600,
                path: '/',
                secure: true,
                httpOnly: true,
                sameSite: 'strict'
            };
            const res = response().cookie('secure-session', 'xyz789', options);
            
            const expectedCookie = 'secure-session=xyz789; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=strict';
            assert.equal(res.headers['Set-Cookie'], expectedCookie);
        });

        test('should set cookie with expires option', () => {
            const expires = new Date('2024-01-01T00:00:00.000Z');
            const res = response().cookie('temp', 'value', { expires });
            
            assert.equal(res.headers['Set-Cookie'], 'temp=value; Expires=Mon, 01 Jan 2024 00:00:00 GMT');
        });

        test('should set cookie with domain option', () => {
            const res = response().cookie('cross-domain', 'value', { domain: '.example.com' });
            
            assert.equal(res.headers['Set-Cookie'], 'cross-domain=value; Domain=.example.com');
        });

        test('should handle multiple cookies', () => {
            const res = response()
                .cookie('first', 'value1')
                .cookie('second', 'value2');
            
            assert.equal(res.headers['Set-Cookie'], 'first=value1, second=value2');
        });

        test('should be chainable', () => {
            const res = response()
                .cookie('session', 'abc123')
                .json({ message: 'logged in' });
            
            assert.equal(res.headers['Set-Cookie'], 'session=abc123');
            assert.equal(res.headers['Content-Type'], 'application/json');
        });
    });

    describe('attachment method', () => {
        test('should set attachment header without filename', () => {
            const res = response().attachment();
            
            assert.equal(res.headers['Content-Disposition'], 'attachment');
        });

        test('should set attachment header with filename', () => {
            const res = response().attachment('report.pdf');
            
            assert.equal(res.headers['Content-Disposition'], 'attachment; filename="report.pdf"');
        });

        test('should be chainable', () => {
            const res = response()
                .attachment('data.csv')
                .header('Content-Type', 'text/csv');
            
            assert.equal(res.headers['Content-Disposition'], 'attachment; filename="data.csv"');
            assert.equal(res.headers['Content-Type'], 'text/csv');
        });
    });

    describe('status method', () => {
        test('should set status code', () => {
            const res = response().status(STATUS_BAD_REQUEST);
            
            assert.equal(res.statusCode, STATUS_BAD_REQUEST);
        });

        test('should be chainable', () => {
            const res = response()
                .status(STATUS_INTERNAL_SERVER_ERROR)
                .json({ error: 'Something went wrong' });
            
            assert.equal(res.statusCode, STATUS_INTERNAL_SERVER_ERROR);
            assert.equal(res.headers['Content-Type'], 'application/json');
        });
    });

    describe('header method', () => {
        test('should set custom header', () => {
            const res = response().header('X-API-Version', '1.0');
            
            assert.equal(res.headers['X-API-Version'], '1.0');
        });

        test('should override existing headers', () => {
            const res = response()
                .header('Content-Type', 'application/xml')
                .header('Content-Type', 'application/json');
            
            assert.equal(res.headers['Content-Type'], 'application/json');
        });

        test('should be chainable', () => {
            const res = response()
                .header('X-Request-ID', '123')
                .header('X-Rate-Limit', '100')
                .status(STATUS_OK);
            
            assert.equal(res.headers['X-Request-ID'], '123');
            assert.equal(res.headers['X-Rate-Limit'], '100');
            assert.equal(res.statusCode, STATUS_OK);
        });
    });

    describe('method chaining', () => {
        test('should support complex chaining', () => {
            const res = response(STATUS_CREATED)
                .header('X-Request-ID', 'req-123')
                .cookie('session', 'new-session', { httpOnly: true })
                .json({ 
                    message: 'User created',
                    id: 42 
                });
            
            assert.equal(res.statusCode, STATUS_CREATED);
            assert.equal(res.headers['X-Request-ID'], 'req-123');
            assert.equal(res.headers['Set-Cookie'], 'session=new-session; HttpOnly');
            assert.equal(res.headers['Content-Type'], 'application/json');
            assert.equal(res.body, '{"message":"User created","id":42}');
        });

        test('should maintain state across method calls', () => {
            let res = response();
            
            res = res.status(STATUS_BAD_REQUEST);
            assert.equal(res.statusCode, STATUS_BAD_REQUEST);
            
            res = res.header('X-Error', 'validation');
            assert.equal(res.headers['X-Error'], 'validation');
            assert.equal(res.statusCode, STATUS_BAD_REQUEST);
            
            res = res.json({ error: 'Invalid input' });
            assert.equal(res.headers['Content-Type'], 'application/json');
            assert.equal(res.headers['X-Error'], 'validation');
            assert.equal(res.statusCode, STATUS_BAD_REQUEST);
        });
    });

    describe('cookie formatting edge cases', () => {
        test('should handle all cookie options together', () => {
            const expires = new Date('2024-12-31T23:59:59.000Z');
            const options: CookieOptions = {
                maxAge: 86400,
                expires,
                domain: '.example.com',
                path: '/admin',
                secure: true,
                httpOnly: true,
                sameSite: 'lax'
            };
            
            const res = response().cookie('admin-session', 'secret', options);
            
            const expectedCookie = 'admin-session=secret; Max-Age=86400; Expires=Tue, 31 Dec 2024 23:59:59 GMT; Domain=.example.com; Path=/admin; Secure; HttpOnly; SameSite=lax';
            assert.equal(res.headers['Set-Cookie'], expectedCookie);
        });

        test('should handle sameSite values correctly', () => {
            const strict = response().cookie('strict', 'value', { sameSite: 'strict' });
            const lax = response().cookie('lax', 'value', { sameSite: 'lax' });
            const none = response().cookie('none', 'value', { sameSite: 'none' });
            
            assert.equal(strict.headers['Set-Cookie'], 'strict=value; SameSite=strict');
            assert.equal(lax.headers['Set-Cookie'], 'lax=value; SameSite=lax');
            assert.equal(none.headers['Set-Cookie'], 'none=value; SameSite=none');
        });
    });
});