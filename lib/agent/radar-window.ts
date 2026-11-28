import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RadarTopic } from './topic-radar';

async function writeSnapshot(directory: string, at: string, snapshot: object): Promise<string> {
  const file = `${at.replace(/:/g, '-')}-${randomUUID()}.json`;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, file), JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
  return file;
}

export async function writeDeskSnapshot(directory: string, snapshot: object): Promise<void> {
  const capturedAt = new Date().toISOString();
  await writeSnapshot(join(directory, 'desk'), capturedAt, { version: 1, capturedAt, ...snapshot });
}

export async function writeRadarWindow(directory: string, start: number, options: {
  maxTopics: number;
  includeAcademic: boolean;
}, sweeps: Record<string, PromiseSettledResult<RadarTopic[]>>): Promise<string> {
  const collectedAt = new Date().toISOString();
  const channels = Object.entries(sweeps).map(([channel, result]) => ({
    channel,
    status: channel === 'academic' && !options.includeAcademic ? 'disabled' : result.status,
    candidates: result.status === 'fulfilled' ? result.value : [],
  }));
  return writeSnapshot(directory, collectedAt, { version: 1, startedAt: new Date(start).toISOString(), collectedAt, options, channels });
}
