import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";

const config = loadConfig();
const logger = createLogger(config);

logger.info({ tradingMode: config.TRADING_MODE }, "application started");
