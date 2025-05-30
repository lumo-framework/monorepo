import { configSchema } from './schema.js';
import { pathToFileURL } from 'url';
import { resolve } from 'path';
import { existsSync } from 'fs';

export async function loadConfig(configPath?: string) {
  // Try different config file names in order of preference
  const configNames = configPath ? [configPath] : ['tsc-run.config.js'];

  let fullPath: string | null = null;
  for (const name of configNames) {
    const candidate = resolve(process.cwd(), name);
    if (existsSync(candidate)) {
      fullPath = candidate;
      break;
    }
  }

  if (!fullPath) {
    throw new Error(`Config file not found. Tried: ${configNames.join(', ')}`);
  }

  const moduleUrl = pathToFileURL(fullPath).href;
  const config = await import(moduleUrl);
  return configSchema.parse(config.default);
}
