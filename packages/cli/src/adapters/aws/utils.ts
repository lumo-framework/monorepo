export function toPascalCase(str: string): string {
  return str
    .split(/[-_ /]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

// NormalisedName is a type alias for string, representing a name that has been normalised to PascalCase
// and is suitable for use in AWS resource names.
export type NormalisedName = string;

export function normaliseName(name: string): NormalisedName {
  return toPascalCase(name).replace(/[^a-zA-Z0-9]/g, '');
}

// Generates a stack name based on the project name and environment.
export function generateStackName(
  projectName: NormalisedName,
  environment: NormalisedName,
  suffix: string = ''
): string {
  return (
    `${normaliseName(projectName)}-${normaliseName(environment)}` +
    (suffix ? `-${normaliseName(suffix)}` : '')
  );
}

export function generateConstructIdentifier() {}

export function generateResourceIdentifier(
  id: string,
  suffix?: string
): NormalisedName {
  return normaliseName(id) + (suffix ? normaliseName(suffix) : '');
}

export function generateExportName(
  projectName: NormalisedName,
  environment: NormalisedName,
  resourceName: string
): string {
  return `${normaliseName(projectName)}-${normaliseName(environment)}-${normaliseName(resourceName)}`;
}
