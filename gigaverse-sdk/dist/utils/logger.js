"use strict";
// path: src/utils/logger.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
/**
 * Minimal logger for production use.
 */
exports.logger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${msg}`),
    success: (msg) => console.log(`[SUCCESS] ${msg}`),
};
