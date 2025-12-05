// path: gigaverse-engine/src/types/CustomLogger.ts
/**
 * Minimal logger interface for the engine package.
 * Users can provide their own logger if they want to pipe logs to a different UI.
 */
export interface CustomLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}
