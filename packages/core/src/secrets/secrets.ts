type SecretResolver = (name: string) => Promise<string>;

let currentResolver: SecretResolver = async (name: string) =>
  process.env[name.toUpperCase()] || '';

export function setSecretResolver(resolver: SecretResolver) {
  currentResolver = resolver;
}

export async function getSecret(name: string): Promise<string> {
  return currentResolver(name);
}
