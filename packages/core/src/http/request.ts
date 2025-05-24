export type Request = {
    path: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
    json: () => Record<string, unknown>;
}