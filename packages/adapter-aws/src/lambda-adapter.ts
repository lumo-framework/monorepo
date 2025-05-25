import type {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import type {http} from '@tsc-run/core';
import { buildRequestFromApiGateway } from './aws-request-builder.js';

// Set up environment variable for queue URL
declare global {
    namespace NodeJS {
        interface ProcessEnv {
            QUEUE_URL?: string;
        }
    }
}

export const lambdaAdapter = (handler: (req: http.Request) => Promise<http.Response>) => {
    return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
        const request = buildRequestFromApiGateway(event);
        const response = await handler(request);

        return {
            statusCode: response.statusCode,
            headers: response.headers || {},
            body: response.body || ''
        };
    };
};
