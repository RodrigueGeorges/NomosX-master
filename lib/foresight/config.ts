/**
 * Foresight Engine — runtime configuration & feature flags
 */

export interface ForesightConfig {
  enabled: boolean;
  maxCostUsd: number;
  chatRateLimitPerMin: number;
  minSeedSourcesToThrottleScout: number;
}

function parseBool(val: string | undefined, defaultVal: boolean): boolean {
  if (val == null || val === "") return defaultVal;
  return val === "1" || val.toLowerCase() === "true" || val.toLowerCase() === "yes";
}

function parseNum(val: string | undefined, defaultVal: number): number {
  const n = Number.parseFloat(val ?? "");
  return Number.isFinite(n) && n > 0 ? n : defaultVal;
}

export function getForesightConfig(): ForesightConfig {
  return {
    enabled: parseBool(process.env.NOMOSX_FORESIGHT_ENABLED, true),
    maxCostUsd: parseNum(process.env.NOMOSX_FORESIGHT_MAX_COST_USD, 5.5),
    chatRateLimitPerMin: parseNum(process.env.NOMOSX_FORESIGHT_CHAT_RATE_LIMIT, 10),
    minSeedSourcesToThrottleScout: parseNum(process.env.NOMOSX_FORESIGHT_MIN_SEED_SOURCES, 8),
  };
}

export function isForesightEnabled(): boolean {
  return getForesightConfig().enabled;
}
