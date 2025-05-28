import chalk from 'chalk';
import boxen from 'boxen';
import ora, { type Ora } from 'ora';
import Table from 'cli-table3';
import prompts from 'prompts';
import figlet from 'figlet';

export interface LogMethods {
  success(message: string): void;
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
  heading(title: string): void;
  boxed(message: string): void;
  progressStep(label: string, done: boolean): void;
  spinner<T>(label: string, fn: () => Promise<T>): Promise<T>;
  table(rows: Record<string, any>[]): void;
  prompt: typeof prompts;
  banner(text: string): void;
}

const success = (message: string): void => {
  console.log(chalk.green('✓'), chalk.bold(message));
};

const error = (message: string): void => {
  console.log(chalk.red('✗'), chalk.red(message));
};

const warn = (message: string): void => {
  console.log(chalk.yellow('⚠'), chalk.dim(message));
};

const info = (message: string): void => {
  console.log(chalk.cyan('ℹ'), message);
};

const heading = (title: string): void => {
  console.log(chalk.bold.underline(title));
};

const boxed = (message: string): void => {
  console.log(boxen(message, {
    padding: 1,
    borderStyle: 'round',
    borderColor: 'cyan'
  }));
};

const progressStep = (label: string, done: boolean): void => {
  const icon = done ? chalk.green('☑') : chalk.gray('☐');
  console.log(`${icon} ${label}`);
};

const spinner = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const spinnerInstance: Ora = ora(label).start();
  try {
    const result = await fn();
    spinnerInstance.succeed();
    return result;
  } catch (err) {
    spinnerInstance.fail();
    throw err;
  }
};

const table = (rows: Record<string, any>[]): void => {
  if (rows.length === 0) {
    console.log(chalk.dim('No data to display'));
    return;
  }

  const headers = Object.keys(rows[0]);
  const tableInstance = new Table({
    head: headers.map(h => chalk.bold(h)),
    style: { head: [], border: [] }
  });

  rows.forEach(row => {
    tableInstance.push(headers.map(header => String(row[header] ?? '')));
  });

  console.log(tableInstance.toString());
};

const banner = (text: string): void => {
  try {
    const rendered = figlet.textSync(text, { horizontalLayout: 'default' });
    console.log(chalk.cyan(rendered));
  } catch (err) {
    console.log(chalk.bold.cyan(text));
  }
};

export const log: LogMethods = {
  success,
  error,
  warn,
  info,
  heading,
  boxed,
  progressStep,
  spinner,
  table,
  prompt: prompts,
  banner
};