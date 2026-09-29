import pino from "pino";

import type { Config } from "./config.js";

export function createLogger(config: Config) {
  return pino({
    level: config.LOG_LEVEL,
    redact: ["apiKey", "apiSecret", "req.headers.authorization"],
  });
}
