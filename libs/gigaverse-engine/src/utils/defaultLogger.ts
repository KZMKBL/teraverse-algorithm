// path: gigaverse-engine/src/utils/defaultLogger.ts
/**
 * Default logger that writes to console if no custom logger is provided.
 */
import { CustomLogger } from "../types/CustomLogger";

export const defaultLogger: CustomLogger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
};
