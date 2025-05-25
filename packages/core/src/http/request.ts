export type Request = {
  method: string;
  url: string;
  path: string;
  query: Record<string, string>;
  params: Record<string, string>;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  ip: string;
  userAgent: string;
  body?: string;
  json: () => Promise<Record<string, unknown>>;
  text: () => Promise<string>;
  formData: () => Promise<Record<string, string | string[]>>;
  buffer: () => Promise<Buffer>;
};

export const createRequest = (data: {
  method: string;
  url: string;
  path: string;
  query?: Record<string, string>;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  ip?: string;
  userAgent?: string;
  body?: string;
}): Request => {
  const request = {
    method: data.method,
    url: data.url,
    path: data.path,
    query: data.query || {},
    params: data.params || {},
    headers: data.headers || {},
    cookies: data.cookies || {},
    ip: data.ip || '',
    userAgent: data.userAgent || '',
    body: data.body,
  };

  return {
    ...request,
    json: async (): Promise<Record<string, unknown>> => {
      if (!request.body) {
        throw new Error('No body to parse as JSON');
      }
      try {
        return JSON.parse(request.body);
      } catch {
        throw new Error('Invalid JSON in request body');
      }
    },
    text: async (): Promise<string> => {
      return request.body || '';
    },
    formData: async (): Promise<Record<string, string | string[]>> => {
      if (!request.body) {
        return {};
      }
      const params = new URLSearchParams(request.body);
      const result: Record<string, string | string[]> = {};

      for (const [key, value] of params.entries()) {
        if (result[key]) {
          if (Array.isArray(result[key])) {
            (result[key] as string[]).push(value);
          } else {
            result[key] = [result[key] as string, value];
          }
        } else {
          result[key] = value;
        }
      }

      return result;
    },
    buffer: async (): Promise<Buffer> => {
      return Buffer.from(request.body || '', 'utf8');
    },
  };
};

export const parseCookies = (cookieHeader?: string): Record<string, string> => {
  if (!cookieHeader) {
    return {};
  }

  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = rest.join('=');
    }
  });

  return cookies;
};

export const parseQuery = (queryString?: string): Record<string, string> => {
  if (!queryString) {
    return {};
  }

  const params = new URLSearchParams(queryString);
  const result: Record<string, string> = {};

  for (const [key, value] of params.entries()) {
    result[key] = value;
  }

  return result;
};
