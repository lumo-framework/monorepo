import { log, chalk } from '@tsc-run/utils';

export class DevLogger {
  constructor(private verbose: boolean = false) {}

  success(message: string): void {
    log.success(message);
  }

  error(message: string): void {
    log.error(message);
  }

  warn(message: string): void {
    log.warn(message);
  }

  info(message: string): void {
    log.info(message);
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(chalk.gray('🔍'), chalk.dim(message));
    }
  }
  async spinner<T>(label: string, fn: () => Promise<T>): Promise<T> {
    return log.spinner(label, fn);
  }

  logRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number
  ): void {
    const methodColor = this.getMethodColor(method);
    const statusColor = this.getStatusColor(statusCode);
    const prefix = chalk.blue('[API]');

    console.log(
      `${prefix} ${methodColor(method.padEnd(6))} ${path} -> ${statusColor(String(statusCode))} ${chalk.gray(`(${duration}ms)`)}`
    );
  }

  logEvent(type: string, subscriberCount: number): void {
    const prefix = chalk.magenta('[EVENT]');
    console.log(
      `${prefix} ${chalk.cyan(type)} -> ${chalk.yellow(`${subscriberCount} subscribers queued`)}`
    );
  }

  logSubscriber(
    name: string,
    success: boolean,
    duration: number,
    error?: string
  ): void {
    const prefix = chalk.green('[SUBSCRIBER]');
    const status = success ? chalk.green('completed') : chalk.red('failed');

    let message = `${prefix} ${chalk.cyan(name)} -> ${status} ${chalk.gray(`(${duration}ms)`)}`;

    if (!success && error) {
      message += `\n${chalk.red('  Error:')} ${error}`;
    }

    console.log(message);
  }

  logFileChange(event: string, filePath: string): void {
    const prefix = chalk.yellow('[WATCH]');
    const eventColor =
      event === 'added'
        ? chalk.green
        : event === 'removed'
          ? chalk.red
          : chalk.blue;

    console.log(`${prefix} ${filePath} -> ${eventColor(event)}`);
  }

  private getMethodColor(method: string): (text: string) => string {
    switch (method.toUpperCase()) {
      case 'GET':
        return chalk.green;
      case 'POST':
        return chalk.yellow;
      case 'PUT':
        return chalk.blue;
      case 'PATCH':
        return chalk.cyan;
      case 'DELETE':
        return chalk.red;
      default:
        return chalk.gray;
    }
  }

  private getStatusColor(statusCode: number): (text: string) => string {
    if (statusCode >= 200 && statusCode < 300) {
      return chalk.green;
    } else if (statusCode >= 300 && statusCode < 400) {
      return chalk.yellow;
    } else if (statusCode >= 400 && statusCode < 500) {
      return chalk.red;
    } else {
      return chalk.magenta;
    }
  }
}
