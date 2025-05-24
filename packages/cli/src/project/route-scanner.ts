import {glob} from 'glob';
import path from 'path';
import {Project, SourceFile, ExportedDeclarations} from 'ts-morph';

interface RouteInfo {
    file: string;
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
}

export async function scanRoutes(): Promise<RouteInfo[]> {
    // Support both src/routes and functions/api patterns
    const searchPatterns = [
        'functions/api/**/*.ts'
    ];

    const allFiles: string[] = [];
    for (const pattern of searchPatterns) {
        try {
            const files = await glob(pattern);
            allFiles.push(...files);
        } catch (error) {
            // Pattern might not exist, continue
        }
    }

    if (allFiles.length === 0) {
        return [];
    }

    const project = new Project();
    const routes: RouteInfo[] = [];

    for (const file of allFiles) {
        try {
            const sourceFile = project.addSourceFileAtPath(file);
            const routeInfo = analyzeRouteFile(sourceFile, file);
            if (routeInfo) {
                routes.push(routeInfo);
            }
        } catch (error) {
            console.warn(`Failed to analyze ${file}:`, error);
        }
    }

    return routes;
}

export async function scanSubscribers(): Promise<SubscriberInfo[]> {
    const searchPatterns = [
        'functions/subscribers/**/*.ts'
    ];

    const allFiles: string[] = [];
    for (const pattern of searchPatterns) {
        try {
            const files = await glob(pattern);
            allFiles.push(...files);
        } catch (error) {
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
        } catch (error) {
            console.warn(`Failed to analyze ${file}:`, error);
        }
    }

    return subscribers;
}

export function expandRoutesToMethods(routes: RouteInfo[]): MethodRoute[] {
    const methodRoutes: MethodRoute[] = [];

    for (const route of routes) {
        // If route has specific HTTP method exports, create separate entries for each
        const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
        const methodExports = route.exports.filter(name => httpMethods.includes(name.toUpperCase()));

        if (methodExports.length > 0) {
            // Create separate method routes for each HTTP method export
            for (const methodExport of methodExports) {
                methodRoutes.push({
                    file: route.file,
                    route: route.route,
                    method: methodExport.toUpperCase(),
                    exportName: methodExport
                });
            }
        } else if (route.hasDefaultExport || route.exports.includes('handler')) {
            // Use default export or handler for all methods
            methodRoutes.push({
                file: route.file,
                route: route.route,
                method: 'ALL',
                exportName: route.hasDefaultExport ? 'default' : 'handler'
            });
        }
    }

    return methodRoutes;
}

function analyzeRouteFile(sourceFile: SourceFile, filePath: string): RouteInfo | null {
    const exports = sourceFile.getExportedDeclarations();
    const hasDefaultExport = sourceFile.getDefaultExportSymbol() !== undefined;

    // Extract export names and detect HTTP method exports
    const exportNames: string[] = [];
    const detectedMethods: string[] = [];

    // List of exact HTTP method names we support
    const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

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
    if (detectedMethods.length === 0 && !hasDefaultExport && exportNames.length === 0) {
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

    return {
        file: filePath,
        route: routePath,
        methods: [...new Set(detectedMethods)], // Remove duplicates
        hasDefaultExport,
        exports: exportNames
    };
}

function analyzeSubscriberFile(sourceFile: SourceFile, filePath: string): SubscriberInfo | null {
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
        exports: exportNames
    };
}