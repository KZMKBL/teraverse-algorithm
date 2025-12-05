/**
 * Minimal HTTP client that wraps fetch calls with logging.
 */
export declare class HttpClient {
    private readonly baseUrl;
    private authToken;
    constructor(baseUrl: string, authToken: string);
    setAuthToken(newToken: string): void;
    /**
     * Sends a POST request with the current auth token.
     */
    post<T>(endpoint: string, body: Record<string, any>): Promise<T>;
    /**
     * Sends a GET request with the current auth token.
     */
    get<T>(endpoint: string): Promise<T>;
}
//# sourceMappingURL=HttpClient.d.ts.map