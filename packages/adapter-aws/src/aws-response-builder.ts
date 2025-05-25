import type { APIGatewayProxyResult } from 'aws-lambda';
import type { http } from '@tsc-run/core';

/**
 * Builds an AWS API Gateway proxy result from a tsc-run Response object
 */
export const buildApiGatewayResponse = (
  response: http.Response
): APIGatewayProxyResult => {
  return {
    statusCode: response.statusCode,
    headers: response.headers || {},
    body: response.body || '',
  };
};
