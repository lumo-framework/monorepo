export function fromEnv(name: string, fallback: string = ''): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Environment variable ${name} is not defined`);
  }
  return value || fallback;
}
