import type { CommandModule } from 'yargs';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

interface NewCommandArgs {
  projectName: string;
}

export const newCommand: CommandModule<object, NewCommandArgs> = {
  command: 'new <projectName>',
  describe: 'Create a new tsc-run project from the template.',
  builder: (yargs) => {
    return yargs.positional('projectName', {
      type: 'string',
      describe: 'Name of the new project directory',
      demandOption: true,
    });
  },
  handler: async (argv) => {
    const { projectName } = argv;

    try {
      console.log(
        `🚀 \x1b[1mCreating new tsc-run project: \x1b[36m${projectName}\x1b[0m\n`
      );

      // Check if directory already exists
      try {
        await fs.access(projectName);
        console.error(
          `❌ Directory \x1b[31m${projectName}\x1b[0m already exists!`
        );
        process.exit(1);
      } catch {
        // Directory doesn't exist, good to proceed
      }

      // Clone the template repository
      console.log('📦 Cloning template repository...');
      execSync(
        `git clone https://github.com/tsc-run/tsc.run.git "${projectName}"`,
        {
          stdio: 'inherit',
        }
      );

      // Remove .git directory from the cloned template
      console.log('🧹 Cleaning up template...');
      await fs.rm(path.join(projectName, '.git'), {
        recursive: true,
        force: true,
      });

      // Change to project directory and install dependencies
      console.log('📋 Installing dependencies...');
      execSync('npm install', {
        cwd: projectName,
        stdio: 'inherit',
      });

      console.log('\n✨ \x1b[1m\x1b[32mProject created successfully!\x1b[0m');
      console.log('\n🎯 \x1b[1mNext steps:\x1b[0m');
      console.log(`   cd ${projectName}`);
      console.log('   npm run dev');
      console.log('\n📚 Learn more at \x1b[36mhttps://docs.tsc.run\x1b[0m\n');
    } catch (error) {
      console.error('\n❌ \x1b[1m\x1b[31mFailed to create project!\x1b[0m');
      console.error(
        `\x1b[31m${error instanceof Error ? error.message : String(error)}\x1b[0m\n`
      );

      // Clean up partial directory if it exists
      try {
        await fs.rm(projectName, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }

      process.exit(1);
    }
  },
};
