import pg from "pg";

import { loadConfig } from "../config.js";

const { Pool } = pg;

export function createPool(connectionString = loadConfig().DATABASE_URL) {
  return new Pool({ connectionString });
}
