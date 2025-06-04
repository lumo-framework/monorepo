import type { config } from '@lumo-framework/core';
import fs from 'fs/promises';

export interface RouteInfo {
  path: string;
  pathPattern: string; // For pattern matching (e.g., "/users/:id")
  method: string;
  functionName: string;
  handlerFunction: string;
  paramNames: string[]; // Parameter names extracted from path
}

export async function generateRouterWorker(
  routes: RouteInfo[],
  routeWorkerUrls: Record<string, string>,
  config: config.Config,
  outputPath: string,
  serviceBindings?: Record<string, string>
): Promise<void> {
  // Create route mapping with service bindings
  const routeMapping = routes.map((route) => {
    // Use pathPattern (converted format) for route key lookup to match deployment
    const routeKey = `${route.pathPattern}:${route.method.toUpperCase()}`;

    // Get the service binding name for this route
    let serviceBinding = '';
    if (serviceBindings) {
      const bindingName = `ROUTE_${routeKey.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
      if (serviceBindings[bindingName]) {
        serviceBinding = bindingName;
      }
    }

    return {
      path: route.path,
      pathPattern: route.pathPattern,
      method: route.method.toUpperCase(),
      serviceBinding: serviceBinding,
      paramNames: route.paramNames,
    };
  });

  const routerCode = `
// Router Worker - orchestrates route workers via Service Bindings
// This router maintains isolation by invoking individual workers through Cloudflare Service Bindings

const ROUTE_WORKERS = ${JSON.stringify(routeMapping, null, 2)};

// Path pattern matching function
function matchPath(pattern, pathname) {
  const paramNames = [];
  const regexPattern = pattern.replace(/:([^/]+)/g, (_, paramName) => {
    paramNames.push(paramName);
    return '([^/]+)';
  });
  
  const regex = new RegExp('^' + regexPattern + '$');
  const match = pathname.match(regex);
  
  if (!match) {
    return { matched: false, params: {} };
  }
  
  const params = {};
  paramNames.forEach((name, index) => {
    params[name] = decodeURIComponent(match[index + 1]);
  });
  
  return { matched: true, params };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const pathname = url.pathname;
    
    let matchingRoute = ROUTE_WORKERS.find(route => 
      route.path === pathname && route.method === method
    );
    
    let pathParams = {};
    
    // If no exact match, try pattern matching
    if (!matchingRoute) {
      for (const route of ROUTE_WORKERS) {
        if (route.method === method) {
          const matchResult = matchPath(route.pathPattern, pathname);
          if (matchResult.matched) {
            matchingRoute = route;
            pathParams = matchResult.params;
            break;
          }
        }
      }
    }
    
    if (!matchingRoute) {
      return new Response(null, { 
        status: 404,
      });
    }
    
    if (!matchingRoute.serviceBinding || !env[matchingRoute.serviceBinding]) {
      console.error('No service binding found for route:', matchingRoute);
      return new Response(JSON.stringify({
        error: 'Service binding not configured',
        route: { path: matchingRoute.path, method: matchingRoute.method },
        serviceBinding: matchingRoute.serviceBinding
      }), { 
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
    
    try {
      // Create a new request for the service binding
      const serviceRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      
      // Add router identification header
      serviceRequest.headers.set('X-Forwarded-By', 'lumo-router');
      serviceRequest.headers.set('X-Original-URL', request.url);
      
      // Add path parameters as headers for the worker to extract
      if (Object.keys(pathParams).length > 0) {
        serviceRequest.headers.set('X-Path-Params', JSON.stringify(pathParams));
      }
      
      // Call the service binding directly
      const response = await env[matchingRoute.serviceBinding].fetch(serviceRequest);

      return response;
      
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: 'Service binding invocation failed',
        details: error.message,
        serviceBinding: matchingRoute.serviceBinding,
        stack: error.stack
      }), { 
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
  }
};
`;

  await fs.writeFile(outputPath, routerCode, 'utf-8');
}

function convertFilePathToPattern(filePath: string): {
  path: string;
  pathPattern: string;
  paramNames: string[];
} {
  // Convert both [id] and {id} style params to :id style params
  const paramNames: string[] = [];
  let pathPattern = filePath;

  // Convert [id] format (from original source)
  pathPattern = pathPattern.replace(/\[([^\]]+)\]/g, (_, paramName) => {
    paramNames.push(paramName);
    return `:${paramName}`;
  });

  // Convert {id} format (from build process)
  pathPattern = pathPattern.replace(/\{([^}]+)\}/g, (_, paramName) => {
    paramNames.push(paramName);
    return `:${paramName}`;
  });

  return {
    path: filePath, // Keep original for exact matching
    pathPattern,
    paramNames,
  };
}

export function extractRouteInfo(
  routes: Array<{
    name: string;
    route?: string;
    path?: string;
    content?: string;
  }>
): RouteInfo[] {
  return routes.map((route) => {
    // Extract method from route name (e.g., "/users/route-get" -> "GET")
    const nameParts = route.name.split('-');
    const method = nameParts[nameParts.length - 1]?.toUpperCase() || 'GET';

    // Remove method from name to get the base path (e.g., "/users/route-get" -> "/users/route")
    const baseRouteName = nameParts.slice(0, -1).join('-');

    // Convert to route path
    let routePath: string;
    if (baseRouteName.endsWith('/route')) {
      // Convert "/users/route" to "/users"
      routePath = baseRouteName.replace('/route', '') || '/';
    } else {
      // Use the base route name as-is
      routePath = baseRouteName || '/';
    }

    // Ensure path starts with / but doesn't have double slashes
    if (!routePath.startsWith('/')) {
      routePath = '/' + routePath;
    }

    // Convert dynamic segments from [id] to :id format
    const { path, pathPattern, paramNames } =
      convertFilePathToPattern(routePath);

    return {
      path,
      pathPattern,
      method: method,
      functionName: route.name,
      handlerFunction: `${route.name.replace(/-/g, '_')}_handler`,
      paramNames,
    };
  });
}
