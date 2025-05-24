import { response, statusCodes } from '@tsc-run/core';
import type { Request, Response } from '@tsc-run/core';

export async function handler(req: Request): Promise<Response> {
  return response(statusCodes.OK, JSON.stringify({ message: 'Hello, World!' }));
}