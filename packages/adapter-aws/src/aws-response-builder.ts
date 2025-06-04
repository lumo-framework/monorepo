import type { APIGatewayProxyResult } from 'aws-lambda';
import type { http } from '@lumo-framework/core';

export const buildApiGatewayResponse = (
  response: http.Response
): APIGatewayProxyResult => {
  return {
    statusCode: response.statusCode,
    headers: response.headers || {},
    body: response.body || '',
  };
};
