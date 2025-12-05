"use strict";
// path: src/client/HttpClient.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpClient = void 0;
const logger_1 = require("../utils/logger");
/**
 * Minimal HTTP client that wraps fetch calls with logging.
 */
class HttpClient {
    constructor(baseUrl, authToken) {
        this.baseUrl = baseUrl;
        this.authToken = authToken;
    }
    setAuthToken(newToken) {
        this.authToken = newToken;
    }
    /**
     * Sends a POST request with the current auth token.
     */
    async post(endpoint, body) {
        logger_1.logger.info(`POST -> ${endpoint}`);
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.authToken}`,
                Accept: "*/*",
            },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const errorBody = await response.text();
            logger_1.logger.error(`HTTP error ${response.status}: ${errorBody}`);
            throw new Error(`POST ${endpoint} failed -> ${response.status}`);
        }
        return (await response.json());
    }
    /**
     * Sends a GET request with the current auth token.
     */
    async get(endpoint) {
        logger_1.logger.info(`GET -> ${endpoint}`);
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${this.authToken}`,
                Accept: "*/*",
            },
        });
        if (!response.ok) {
            const errorBody = await response.text();
            logger_1.logger.error(`HTTP error ${response.status}: ${errorBody}`);
            throw new Error(`GET ${endpoint} failed -> ${response.status}`);
        }
        return (await response.json());
    }
}
exports.HttpClient = HttpClient;
