import chalk from 'chalk';

export interface ProgressItem {
  name: string;
  completed: number;
  total: number;
}

export class ProgressDisplay {
  private items: Map<string, ProgressItem> = new Map();
  private statusMessage: string = '';
  private statusIcon: string = '⚡';
  private isComplete: boolean = false;

  constructor() {
    // Hide cursor for cleaner display
    process.stdout.write('\x1B[?25l');
  }

  addItem(name: string, total: number): void {
    this.items.set(name, { name, completed: 0, total });
  }

  updateItem(name: string, completed: number): void {
    const item = this.items.get(name);
    if (item) {
      item.completed = Math.min(completed, item.total);
    }
  }

  setStatus(icon: string, message: string): void {
    this.statusIcon = icon;
    this.statusMessage = message;
  }

  clearStatus(): void {
    this.statusMessage = '';
    this.statusIcon = '';
  }

  private renderProgressBar(completed: number, total: number): string {
    const barLength = 4;
    const filled = Math.round((completed / total) * barLength);
    const empty = barLength - filled;

    const filledChar = '█';
    const emptyChar = '░';

    const bar = filledChar.repeat(filled) + emptyChar.repeat(empty);

    if (completed === total) {
      return chalk.green(bar);
    } else if (completed > 0) {
      return chalk.yellow(bar);
    }
    return chalk.gray(bar);
  }

  render(): void {
    // Clear the current line and move cursor to beginning
    process.stdout.write('\r\x1B[2K');

    // Render all items horizontally
    const itemsArray = Array.from(this.items.values());
    const itemStrings = itemsArray.map((item) => {
      const progress = this.renderProgressBar(item.completed, item.total);
      const checkmark = item.completed === item.total ? chalk.green(' ✓') : '';
      return `${item.name} (${item.completed}/${item.total}) ${progress}${checkmark}`;
    });

    // Join items with double spaces
    const progressLine = itemsArray.length > 0 ? itemStrings.join('  ') : '';

    // Write progress line
    process.stdout.write(progressLine);

    // Write status on next line if we have one
    if (this.statusMessage) {
      process.stdout.write(`\n${this.statusIcon} ${this.statusMessage}`);
      // Move cursor back up for next update
      if (!this.isComplete) {
        process.stdout.write('\x1B[1A');
      }
    }
  }

  complete(
    finalIcon: string = '✅',
    finalMessage: string = 'Deployment complete!'
  ): void {
    this.isComplete = true;
    this.statusIcon = finalIcon;
    this.statusMessage = finalMessage;

    // Mark all items as complete
    this.items.forEach((item) => {
      item.completed = item.total;
    });

    this.render();

    // Show cursor again and add final newline
    process.stdout.write('\x1B[?25h\n\n');
  }

  error(errorMessage: string): void {
    this.isComplete = true;
    this.statusIcon = '❌';
    this.statusMessage = errorMessage;
    this.render();

    // Show cursor again and add final newline
    process.stdout.write('\x1B[?25h\n\n');
  }

  cleanup(): void {
    // Ensure cursor is shown again
    process.stdout.write('\x1B[?25h');
  }
}
