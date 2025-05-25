import type { APIGatewayProxyEvent } from 'aws-lambda';
import type { http } from '@tsc-run/core';
import {
  createRequest,
  parseCookies,
  parseQuery,
} from '@tsc-run/core/dist/http/request.js';

/**
 * Builds a tsc-run Request object from an AWS API Gateway proxy event
 */
export const buildRequestFromApiGateway = (
  event: APIGatewayProxyEvent
): http.Request => {
  // Normalise headers to ensure they exist and filter out undefined values
  const headers = Object.fromEntries(
    Object.entries(event.headers || {})
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => [key, value!])
  );

  // Extract URL components
  const protocol = headers['X-Forwarded-Proto'] || 'https';
  const host = headers['Host'] || 'localhost';

  // Convert query parameters to URLSearchParams format
  let queryString = '';
  if (event.queryStringParameters) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(event.queryStringParameters)) {
      if (value !== null && value !== undefined) {
        params.append(key, value);
      }
    }
    queryString = params.toString();
  }

  // Build the full URL
  const url = `${protocol}://${host}${event.path}${queryString ? '?' + queryString : ''}`;

  // Extract path parameters, filtering out undefined values
  const params = Object.fromEntries(
    Object.entries(event.pathParameters || {})
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => [key, value!])
  );

  // Extract client IP from various possible headers
  const ip = extractClientIp(headers);

  return createRequest({
    method: event.httpMethod,
    url,
    path: event.path,
    query: parseQuery(queryString),
    params,
    headers,
    cookies: parseCookies(headers['Cookie']),
    ip,
    userAgent: headers['User-Agent'] || '',
    body: event.body || undefined,
  });
};

/**
 * Extracts the client IP address from request headers
 * Checks multiple headers in order of preference
 */
const extractClientIp = (headers: Record<string, string>): string => {
  // X-Forwarded-For can contain multiple IPs, take the first one (original client)
  const forwardedFor = headers['X-Forwarded-For'];
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  // Alternative headers for client IP
  return (
    headers['X-Real-IP'] ||
    headers['X-Client-IP'] ||
    headers['X-Forwarded'] ||
    headers['Forwarded-For'] ||
    headers['Forwarded'] ||
    ''
  );
};

/**
 * Type guard to check if an event is an API Gateway proxy event
 */
export const isApiGatewayProxyEvent = (
  event: unknown
): event is APIGatewayProxyEvent => {
  return (
    typeof event === 'object' &&
    event !== null &&
    'httpMethod' in event &&
    'path' in event &&
    'headers' in event
  );
};
