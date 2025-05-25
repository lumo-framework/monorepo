import type {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import type {http} from '@tsc-run/core';

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
        const request: http.Request = {
            path: event.path,
            method: event.httpMethod,
            headers: Object.fromEntries(
                Object.entries(event.headers || {}).filter(([_, value]) => value !== undefined).map(([key, value]) => [key, value!])
            ),
            body: event.body || undefined,
            json: () => {
                if (event.body && event.headers['Content-Type'] === 'application/json') {
                    return JSON.parse(event.body);
                }
                return {};
            }
        };

        const response = await handler(request);

        return {
            statusCode: response.statusCode,
            headers: response.headers || {},
            body: response.body || ''
        };
    };
};
