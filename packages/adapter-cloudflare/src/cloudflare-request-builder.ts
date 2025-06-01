import { http } from '@tsc-run/core';
import type { ExecutionContext } from './types.js';
import './types.js';

export const buildRequestFromCloudflare = (
  request: globalThis.Request,
  _env: Record<string, unknown>,
  _ctx: ExecutionContext
): http.Request => {
  const headers: Record<string, string> = {};
  request.headers.forEach((value: string, key: string) => {
    headers[key] = value;
  });

  // Use X-Original-URL header if present (set by router), otherwise use request.url
  const originalUrl = headers['x-original-url'] || request.url;
  const url = new URL(originalUrl);

  // Extract path parameters from router headers
  const params: Record<string, string> = {};
  const pathParamsHeader = headers['x-path-params'];
  if (pathParamsHeader) {
    try {
      Object.assign(params, JSON.parse(pathParamsHeader));
    } catch {
      // If parsing fails, ignore and use empty params
    }
  }

  // Extract client IP from CF headers
  const ip = extractClientIp(headers, request);

  // Build query parameters
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  return http.createRequest({
    method: request.method,
    url: originalUrl,
    path: url.pathname,
    query,
    params,
    headers,
    cookies: http.parseCookies(headers['cookie']),
    ip,
    userAgent: headers['user-agent'] || '',
    body: undefined, // Will be set later by reading the request body
  });
};

const extractClientIp = (
  headers: Record<string, string>,
  _request: globalThis.Request
): string => {
  // Cloudflare-specific headers
  const cfConnectingIp = headers['cf-connecting-ip'];
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Standard headers
  const forwardedFor = headers['x-forwarded-for'];
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  // Fallback headers
  return (
    headers['x-real-ip'] ||
    headers['x-client-ip'] ||
    headers['true-client-ip'] ||
    ''
  );
};

export const withRequestBody = async (
  request: http.Request,
  cfRequest: globalThis.Request
): Promise<http.Request> => {
  let body: string | undefined;

  try {
    const contentType = request.headers['content-type'] || '';

    if (
      contentType.includes('application/json') ||
      contentType.includes('text/') ||
      contentType.includes('application/x-www-form-urlencoded')
    ) {
      body = await cfRequest.text();
    } else {
      // For binary data, convert to base64 string
      const arrayBuffer = await cfRequest.arrayBuffer();
      body = Buffer.from(arrayBuffer).toString('base64');
    }
  } catch {
    // If reading body fails, leave it undefined
    body = undefined;
  }

  return {
    ...request,
    body,
  };
};

export const isCloudflareRequest = (
  obj: unknown
): obj is globalThis.Request => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'method' in obj &&
    'url' in obj &&
    'headers' in obj
  );
};
