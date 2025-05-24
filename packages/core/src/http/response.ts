export const STATUS_OK = 200;
export const STATUS_CREATED = 201;
export const STATUS_ACCEPTED = 202;
export const STATUS_NO_CONTENT = 204;

export const STATUS_BAD_REQUEST = 400;
export const STATUS_UNAUTHORIZED = 401;
export const STATUS_FORBIDDEN = 403;
export const STATUS_NOT_FOUND = 404;
export const STATUS_METHOD_NOT_ALLOWED = 405;
export const STATUS_CONFLICT = 409;
export const STATUS_UNPROCESSABLE_ENTITY = 422;

export const STATUS_INTERNAL_SERVER_ERROR = 500;
export const STATUS_NOT_IMPLEMENTED = 501;
export const STATUS_SERVICE_UNAVAILABLE = 503;

export type Response = {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    json: (data: string | Record<string, unknown>) => Response;
    header: (name: string, value: string) => Response;
}

type ResponseWithoutFunctions = Omit<Response, 'json' | 'header'>;

const json = (response: ResponseWithoutFunctions) => (data: string | Record<string, unknown>): Response => {
    response.headers['Content-Type'] = 'application/json';
    response.body = JSON.stringify(data);

    return {
        ...response,
        json: json(response),
        header: header(response),
    };
}

const header = (response: ResponseWithoutFunctions) => (name: string, value: string): Response => {
    response.headers[name] = value;

    return {
        ...response,
        json: json(response),
        header: header(response),
    };
}

export const response = (statusCode: number = STATUS_OK): Response => {
    const res = {
        statusCode,
        headers: {
            'Content-Type': 'text/plain',
        },
        body: '',
    }

    return {
        ...res,
        json: json(res),
        header: header(res),
    }
}