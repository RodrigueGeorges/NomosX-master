/**
 * Load env before any lib imports that validate process.env (lib/env.ts).
 * Import this module first in CLI scripts.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });
if (process.env.NODE_ENV === "production") {
  config({ path: ".env.production" });
}
