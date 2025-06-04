import type { http } from '@lumo-framework/core';

export const buildCloudflareResponse = (
  response: http.Response
): globalThis.Response => {
  // Handle Set-Cookie headers properly for Cloudflare Workers
  const headers = new Headers();

  for (const [key, value] of Object.entries(response.headers || {})) {
    if (key.toLowerCase() === 'set-cookie') {
      // Handle multiple cookies
      if (typeof value === 'string') {
        // Split by ', ' to handle multiple cookies in one header
        const cookies = value.split(', ');
        cookies.forEach((cookie) => {
          headers.append('Set-Cookie', cookie);
        });
      } else {
        headers.set(key, value);
      }
    } else {
      headers.set(key, value);
    }
  }

  return new globalThis.Response(response.body || '', {
    status: response.statusCode,
    headers,
  });
};
