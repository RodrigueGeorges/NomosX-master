/**
 * Temporal configuration — opt-in durable orchestration.
 *
 * The think-tank cycle can run either on the legacy PG-backed durable worker
 * (default) or on Temporal (when TEMPORAL_ENABLED=1). Nothing here is loaded
 * by the Next.js bundle unless explicitly imported — the client and worker
 * pull native deps and must stay in the worker entrypoint.
 *
 * Temporal Cloud auth: API key (TEMPORAL_API_KEY) or mTLS cert pair.
 */

export interface TemporalConfig {
  enabled: boolean;
  address: string;
  namespace: string;
  taskQueue: string;
  apiKey?: string;
  tlsCert?: string;
  tlsKey?: string;
}

export function getTemporalConfig(env: NodeJS.ProcessEnv = process.env): TemporalConfig {
  const apiKey = env.TEMPORAL_API_KEY || undefined;
  const tlsCert = env.TEMPORAL_TLS_CERT || undefined;
  const tlsKey = env.TEMPORAL_TLS_KEY || undefined;
  const enabled =
    env.TEMPORAL_ENABLED === '1' &&
    Boolean(env.TEMPORAL_ADDRESS) &&
    Boolean(env.TEMPORAL_NAMESPACE) &&
    (Boolean(apiKey) || (Boolean(tlsCert) && Boolean(tlsKey)));
  return {
    enabled,
    address: env.TEMPORAL_ADDRESS ?? 'localhost:7233',
    namespace: env.TEMPORAL_NAMESPACE ?? 'default',
    taskQueue: env.TEMPORAL_TASK_QUEUE ?? 'nomosx-pipeline',
    apiKey,
    tlsCert,
    tlsKey,
  };
}
