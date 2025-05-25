export function generateWrapper(routeFile: string, route: string) {
  return `
import { handler } from '${routeFile}';
import type { Request, Response } from '@tsc-run/core';

export const wrappedHandler = async (event: any, context: any) => {
  const request: Request = {
    path: '${route}',
    method: event.httpMethod,
    headers: event.headers,
    body: event.body
  };
  
  const response: Response = await handler(request);
  
  return {
    statusCode: response.status,
    headers: response.headers,
    body: response.body
  };
};
`;
}
