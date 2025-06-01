export function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function generateStackName(
  projectName: string,
  environment: string,
  domain: string
): string {
  return `${toPascalCase(projectName)}${toPascalCase(environment)}${toPascalCase(domain)}Stack`;
}
