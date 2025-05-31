import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { http } from '@tsc-run/core';

type Request = http.Request;
type Response = http.Response;

export class RequestAdapter {
  static fromExpress(
    req: ExpressRequest,
    params: Record<string, string> = {}
  ): Request {
    // Parse cookies from header
    const cookies = http.parseCookies(req.headers.cookie);

    // Parse query string
    const query = http.parseQuery(req.url?.split('?')[1]);

    // Get headers as string record
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value.join(', ');
      } else if (value !== undefined) {
        headers[key] = String(value);
      }
    }

    // Get body as string
    let body: string | undefined;
    if (req.body !== undefined) {
      if (typeof req.body === 'string') {
        body = req.body;
      } else {
        body = JSON.stringify(req.body);
      }
    }

    return http.createRequest({
      method: req.method,
      url: req.url || '',
      path: req.path,
      query,
      params,
      headers,
      cookies,
      ip: req.ip || req.connection.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
      body,
    });
  }

  static toExpress(tscResponse: Response, res: ExpressResponse): void {
    // Set status code
    res.status(tscResponse.statusCode);

    // Set headers
    for (const [key, value] of Object.entries(tscResponse.headers)) {
      res.set(key, value);
    }

    // Send body
    if (tscResponse.body) {
      // Check if the response is JSON
      const contentType =
        tscResponse.headers['Content-Type'] ||
        tscResponse.headers['content-type'];
      if (contentType && contentType.includes('application/json')) {
        try {
          const jsonData = JSON.parse(tscResponse.body);
          res.json(jsonData);
        } catch {
          // If parsing fails, send as text
          res.send(tscResponse.body);
        }
      } else {
        res.send(tscResponse.body);
      }
    } else {
      res.end();
    }
  }
}
