import type { CommandModule } from 'yargs';
import { DevServer } from '../dev/dev-server.js';
import { log } from '@lumo-framework/utils';

export const devCommand: CommandModule = {
  command: 'dev',
  describe: 'Start local development server with hot reloading',
  builder: (yargs) => {
    return yargs
      .option('port', {
        alias: 'p',
        type: 'number',
        description: 'Port to run the development server on',
        default: 3000,
      })
      .option('verbose', {
        alias: 'v',
        type: 'boolean',
        description: 'Enable verbose logging',
        default: false,
      });
  },
  handler: async (argv) => {
    try {
      const devServer = new DevServer({
        port: argv.port as number,
        verbose: argv.verbose as boolean,
      });

      await devServer.start();
    } catch (error) {
      log.error('Failed to start development server!');
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  },
};
