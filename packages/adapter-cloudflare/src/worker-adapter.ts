import type { http } from '@tsc-run/core';
import type { ExecutionContext } from './types.js';
import './types.js';
import {
  buildRequestFromCloudflare,
  withRequestBody,
} from './cloudflare-request-builder.js';
import { buildCloudflareResponse } from './cloudflare-response-builder.js';

export const workerAdapter = (
  handler: (req: http.Request) => Promise<http.Response>
) => {
  return async (
    request: globalThis.Request,
    env: Record<string, unknown>,
    ctx: ExecutionContext
  ): Promise<globalThis.Response> => {
    // Build the framework request object
    let tscRequest = buildRequestFromCloudflare(request, env, ctx);

    // Read the request body
    tscRequest = await withRequestBody(tscRequest, request);

    // Call the user's handler
    const tscResponse = await handler(tscRequest);

    // Convert back to Cloudflare Workers Response
    return buildCloudflareResponse(tscResponse);
  };
};
