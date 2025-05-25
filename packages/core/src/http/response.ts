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

export type CookieOptions = {
    maxAge?: number;
    expires?: Date;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
};

export type Response = {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    json: (data: string | Record<string, unknown>) => Response;
    html: (content: string) => Response;
    redirect: (url: string, status?: number) => Response;
    cookie: (name: string, value: string, options?: CookieOptions) => Response;
    attachment: (filename?: string) => Response;
    status: (code: number) => Response;
    header: (name: string, value: string) => Response;
}

type ResponseWithoutFunctions = Omit<Response, 'json' | 'html' | 'redirect' | 'cookie' | 'attachment' | 'status' | 'header'>;

const createResponseHelpers = (response: ResponseWithoutFunctions) => ({
    json: json(response),
    html: html(response),
    redirect: redirect(response),
    cookie: cookie(response),
    attachment: attachment(response),
    status: status(response),
    header: header(response),
});

const json = (response: ResponseWithoutFunctions) => (data: string | Record<string, unknown>): Response => {
    response.headers['Content-Type'] = 'application/json';
    response.body = JSON.stringify(data);

    return {
        ...response,
        ...createResponseHelpers(response),
    };
};

const html = (response: ResponseWithoutFunctions) => (content: string): Response => {
    response.headers['Content-Type'] = 'text/html';
    response.body = content;

    return {
        ...response,
        ...createResponseHelpers(response),
    };
};

const redirect = (response: ResponseWithoutFunctions) => (url: string, statusCode: number = 302): Response => {
    response.statusCode = statusCode;
    response.headers['Location'] = url;
    response.body = '';

    return {
        ...response,
        ...createResponseHelpers(response),
    };
};

const formatCookie = (name: string, value: string, options: CookieOptions = {}): string => {
    let cookie = `${name}=${value}`;
    
    if (options.maxAge !== undefined) {
        cookie += `; Max-Age=${options.maxAge}`;
    }
    
    if (options.expires) {
        cookie += `; Expires=${options.expires.toUTCString()}`;
    }
    
    if (options.domain) {
        cookie += `; Domain=${options.domain}`;
    }
    
    if (options.path) {
        cookie += `; Path=${options.path}`;
    }
    
    if (options.secure) {
        cookie += '; Secure';
    }
    
    if (options.httpOnly) {
        cookie += '; HttpOnly';
    }
    
    if (options.sameSite) {
        cookie += `; SameSite=${options.sameSite}`;
    }
    
    return cookie;
};

const cookie = (response: ResponseWithoutFunctions) => (name: string, value: string, options: CookieOptions = {}): Response => {
    const cookieValue = formatCookie(name, value, options);
    
    if (response.headers['Set-Cookie']) {
        const existing = response.headers['Set-Cookie'];
        response.headers['Set-Cookie'] = Array.isArray(existing) ? 
            [...existing, cookieValue].join(', ') : 
            `${existing}, ${cookieValue}`;
    } else {
        response.headers['Set-Cookie'] = cookieValue;
    }

    return {
        ...response,
        ...createResponseHelpers(response),
    };
};

const attachment = (response: ResponseWithoutFunctions) => (filename?: string): Response => {
    if (filename) {
        response.headers['Content-Disposition'] = `attachment; filename="${filename}"`;
    } else {
        response.headers['Content-Disposition'] = 'attachment';
    }

    return {
        ...response,
        ...createResponseHelpers(response),
    };
};

const status = (response: ResponseWithoutFunctions) => (code: number): Response => {
    response.statusCode = code;

    return {
        ...response,
        ...createResponseHelpers(response),
    };
};

const header = (response: ResponseWithoutFunctions) => (name: string, value: string): Response => {
    response.headers[name] = value;

    return {
        ...response,
        ...createResponseHelpers(response),
    };
};

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
        ...createResponseHelpers(res),
    }
}