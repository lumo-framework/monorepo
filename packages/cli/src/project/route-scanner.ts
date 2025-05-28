import { glob } from 'glob';
import path from 'path';
import { Project, SourceFile } from 'ts-morph';

interface RouteInfo {
  file: string | string[];
  route: string;
  methods: string[];
  hasDefaultExport: boolean;
  exports: string[];
}

interface MethodRoute {
  file: string;
  route: string;
  method: string;
  exportName: string;
}

type SubscriberInfo = {
  file: string;
  name: string;
  hasDefaultExport: boolean;
  exports: string[];
};

export async function scanRoutes(): Promise<RouteInfo[]> {
  const searchPatterns = ['functions/api/**/*.ts'];

  const allFiles: string[] = [];
  for (const pattern of searchPatterns) {
    try {
      const files = await glob(pattern);
      allFiles.push(...files);
    } catch {
      // Pattern might not exist, continue
    }
  }

  if (allFiles.length === 0) {
    return [];
  }

  const project = new Project();
  const routeMap = new Map<string, RouteInfo>();

  for (const file of allFiles) {
    try {
      const sourceFile = project.addSourceFileAtPath(file);
      const routeInfo = analyzeRouteFile(sourceFile, file);
      if (routeInfo) {
        const existingRoute = routeMap.get(routeInfo.route);
        if (existingRoute) {
          // Merge with existing route
          existingRoute.methods = [
            ...new Set([...existingRoute.methods, ...routeInfo.methods]),
          ];
          existingRoute.exports = [
            ...new Set([...existingRoute.exports, ...routeInfo.exports]),
          ];
          existingRoute.hasDefaultExport =
            existingRoute.hasDefaultExport || routeInfo.hasDefaultExport;
          // Keep the file reference - we'll need to track multiple files later
          if (Array.isArray(existingRoute.file)) {
            (existingRoute.file as string[]).push(routeInfo.file as string);
          } else {
            existingRoute.file = [
              existingRoute.file as string,
              routeInfo.file as string,
            ];
          }
        } else {
          routeMap.set(routeInfo.route, routeInfo);
        }
      }
    } catch {
      console.warn(`Failed to analyze ${file}`);
    }
  }

  return Array.from(routeMap.values());
}

export async function scanSubscribers(): Promise<SubscriberInfo[]> {
  const searchPatterns = ['functions/subscribers/**/*.ts'];

  const allFiles: string[] = [];
  for (const pattern of searchPatterns) {
    try {
      const files = await glob(pattern);
      allFiles.push(...files);
    } catch {
      // Pattern might not exist, continue
    }
  }

  if (allFiles.length === 0) {
    return [];
  }

  const project = new Project();
  const subscribers: SubscriberInfo[] = [];

  for (const file of allFiles) {
    try {
      const sourceFile = project.addSourceFileAtPath(file);
      const subscriberInfo = analyzeSubscriberFile(sourceFile, file);
      if (subscriberInfo) {
        subscribers.push(subscriberInfo);
      }
    } catch {
      console.warn(`Failed to analyze ${file}`);
    }
  }

  return subscribers;
}

export function expandRoutesToMethods(routes: RouteInfo[]): MethodRoute[] {
  const methodRoutes: MethodRoute[] = [];

  for (const route of routes) {
    const httpMethods = [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
    ];

    // Handle routes with multiple files - need to analyze each file individually
    const files = Array.isArray(route.file) ? route.file : [route.file];

    // For routes with multiple files, we need to scan each file to find which exports which methods
    if (files.length > 1) {
      const project = new Project();

      for (const file of files) {
        try {
          const sourceFile = project.addSourceFileAtPath(file);
          const exports = sourceFile.getExportedDeclarations();
          const hasDefaultExport =
            sourceFile.getDefaultExportSymbol() !== undefined;
          const exportNames: string[] = [];
          exports.forEach((_, name: string) => {
            exportNames.push(name);
          });

          const methodExports = exportNames.filter((name) =>
            httpMethods.includes(name.toUpperCase())
          );

          if (methodExports.length > 0) {
            // Create separate method routes for each HTTP method export
            for (const methodExport of methodExports) {
              methodRoutes.push({
                file: file,
                route: route.route,
                method: methodExport.toUpperCase(),
                exportName: methodExport,
              });
            }
          } else if (hasDefaultExport || exportNames.includes('handler')) {
            // Use default export or handler for all methods
            methodRoutes.push({
              file: file,
              route: route.route,
              method: 'ALL',
              exportName: hasDefaultExport ? 'default' : 'handler',
            });
          }
        } catch {
          console.warn(`Failed to analyze ${file} for method expansion`);
        }
      }
    } else {
      // Single file route - use the consolidated exports
      const methodExports = route.exports.filter((name) =>
        httpMethods.includes(name.toUpperCase())
      );

      if (methodExports.length > 0) {
        // Create separate method routes for each HTTP method export
        for (const methodExport of methodExports) {
          methodRoutes.push({
            file: files[0],
            route: route.route,
            method: methodExport.toUpperCase(),
            exportName: methodExport,
          });
        }
      } else if (route.hasDefaultExport || route.exports.includes('handler')) {
        // Use default export or handler for all methods
        methodRoutes.push({
          file: files[0],
          route: route.route,
          method: 'ALL',
          exportName: route.hasDefaultExport ? 'default' : 'handler',
        });
      }
    }
  }

  return methodRoutes;
}

function analyzeRouteFile(
  sourceFile: SourceFile,
  filePath: string
): RouteInfo | null {
  const exports = sourceFile.getExportedDeclarations();
  const hasDefaultExport = sourceFile.getDefaultExportSymbol() !== undefined;

  // Extract export names and detect HTTP method exports
  const exportNames: string[] = [];
  const detectedMethods: string[] = [];

  // List of exact HTTP method names we support
  const httpMethods = [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'HEAD',
    'OPTIONS',
  ];

  exports.forEach((_, name: string) => {
    exportNames.push(name);

    // Check for exact HTTP method export names
    if (httpMethods.includes(name.toUpperCase())) {
      detectedMethods.push(name.toUpperCase());
    }
  });

  // Fallback: check for default export or handler function
  if (detectedMethods.length === 0) {
    if (hasDefaultExport || exportNames.includes('handler')) {
      detectedMethods.push('ALL');
    }
  }

  // Skip files with no valid exports
  if (
    detectedMethods.length === 0 &&
    !hasDefaultExport &&
    exportNames.length === 0
  ) {
    return null;
  }

  // Generate route path from file path
  let routePath: string;
  if (filePath.includes('functions/api')) {
    const relativePath = path.relative('functions/api', filePath);
    routePath = '/' + relativePath.replace(/\.ts$/, '').replace(/\\/g, '/');
  } else {
    throw new Error(`Unsupported file path: ${filePath}`);
  }

  // Handle index files
  if (routePath.endsWith('/index')) {
    routePath = routePath.replace('/index', '') || '/';
  }

  // Handle method-specific files that should map to directory route
  // If the file is not index.ts and doesn't have dynamic parameters (no []),
  // and is in a directory with other files, it should map to the directory route
  const pathParts = routePath.split('/');
  const fileName = pathParts[pathParts.length - 1];

  // Check if this is a method-specific file (not index, not dynamic parameter)
  if (
    fileName &&
    fileName !== '' &&
    !fileName.includes('[') &&
    !fileName.includes(']') &&
    pathParts.length > 1
  ) {
    // Common method-specific file names that should map to parent directory
    const methodFiles = ['create', 'update', 'delete', 'edit', 'new'];
    if (methodFiles.includes(fileName.toLowerCase())) {
      // Map to parent directory route
      routePath = pathParts.slice(0, -1).join('/') || '/';
    }
  }

  return {
    file: filePath,
    route: routePath,
    methods: [...new Set(detectedMethods)], // Remove duplicates
    hasDefaultExport,
    exports: exportNames,
  };
}

function analyzeSubscriberFile(
  sourceFile: SourceFile,
  filePath: string
): SubscriberInfo | null {
  const exports = sourceFile.getExportedDeclarations();
  const hasDefaultExport = sourceFile.getDefaultExportSymbol() !== undefined;

  // Extract export names
  const exportNames: string[] = [];
  exports.forEach((_, name: string) => {
    exportNames.push(name);
  });

  // Skip files with no valid exports
  if (!hasDefaultExport && exportNames.length === 0) {
    return null;
  }

  // Generate subscriber name from file path
  let subscriberName: string;
  if (filePath.includes('functions/subscribers')) {
    const relativePath = path.relative('functions/subscribers', filePath);
    subscriberName = relativePath.replace(/\.ts$/, '').replace(/\\/g, '/');
  } else {
    throw new Error(`Unsupported subscriber file path: ${filePath}`);
  }

  return {
    file: filePath,
    name: subscriberName,
    hasDefaultExport,
    exports: exportNames,
  };
}
