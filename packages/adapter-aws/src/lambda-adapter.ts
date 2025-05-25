import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { http } from '@tsc-run/core';
import { buildRequestFromApiGateway } from './aws-request-builder.js';
import { buildApiGatewayResponse } from './aws-response-builder.js';

export const lambdaAdapter = (
  handler: (req: http.Request) => Promise<http.Response>
) => {
  return async (
    event: APIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    const request = buildRequestFromApiGateway(event);
    const response = await handler(request);

    return buildApiGatewayResponse(response);
  };
};
