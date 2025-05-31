export function fromEnv(name: string, fallback: string = ''): string {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  return value || fallback;
}
