import {configSchema} from './schema.js';
import {pathToFileURL} from "url";
import {resolve} from 'path';
import {existsSync} from 'fs';
import {build} from 'esbuild';
import {tmpdir} from 'os';
import {join} from 'path';

export async function loadConfig(configPath?: string) {
    // Try different config file names in order of preference
    const configNames = configPath ? [configPath] : [
        'tsc-run.config.ts',
        'tsc-run.config.js',
        'tsc-run.config.mjs'
    ];
    
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
    
    let moduleUrl: string;
    
    // If it's a TypeScript file, compile it first
    if (fullPath.endsWith('.ts')) {
        const result = await build({
            entryPoints: [fullPath],
            bundle: true,
            platform: 'node',
            format: 'esm',
            write: false,
            target: 'es2022',
            external: ['@tsc-run/core']
        });
        
        // Write to temp file and import
        const tempFile = join(tmpdir(), `tsc-run-config-${Date.now()}.mjs`);
        const fs = await import('fs/promises');
        await fs.writeFile(tempFile, result.outputFiles[0].text);
        moduleUrl = pathToFileURL(tempFile).href;
    } else {
        moduleUrl = pathToFileURL(fullPath).href;
    }
    
    const config = await import(moduleUrl);
    return configSchema.parse(config.default);
}