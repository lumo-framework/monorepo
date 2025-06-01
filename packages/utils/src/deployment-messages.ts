/**
 * Shared utility functions for consistent deployment progress messaging
 */

import type { ProgressDisplay } from './progress-display.js';

/**
 * Standard deployment icons used across adapters
 */
export const DEPLOYMENT_ICONS = {
  /** Route deployment */
  ROUTE: '⚡',
  /** Subscriber/event handler deployment */
  SUBSCRIBER: '📡',
  /** Infrastructure/stack deployment */
  INFRASTRUCTURE: '☁️',
  /** Router/main app deployment */
  ROUTER: '🚀',
  /** Queue/messaging setup */
  QUEUE: '🔄',
  /** Bootstrap/initialization */
  BOOTSTRAP: '🔧',
  /** Success completion */
  SUCCESS: '✅',
  /** Error/failure */
  ERROR: '❌',
} as const;

/**
 * Show deployment progress for a route
 */
export function showRouteDeploymentProgress(
  progress: ProgressDisplay,
  routePath: string
): void {
  progress.setStatus(
    DEPLOYMENT_ICONS.ROUTE,
    `Deploying route: ${routePath}...`
  );
  progress.render();
}

/**
 * Show deployment progress for a subscriber
 */
export function showSubscriberDeploymentProgress(
  progress: ProgressDisplay,
  subscriberName: string
): void {
  progress.setStatus(
    DEPLOYMENT_ICONS.SUBSCRIBER,
    `Deploying subscriber: ${subscriberName}...`
  );
  progress.render();
}

/**
 * Show infrastructure deployment progress
 */
export function showInfrastructureDeploymentProgress(
  progress: ProgressDisplay,
  message: string = 'Deploying infrastructure...'
): void {
  progress.setStatus(DEPLOYMENT_ICONS.INFRASTRUCTURE, message);
  progress.render();
}

/**
 * Show router deployment progress
 */
export function showRouterDeploymentProgress(
  progress: ProgressDisplay,
  message: string = 'Deploying router...'
): void {
  progress.setStatus(DEPLOYMENT_ICONS.ROUTER, message);
  progress.render();
}

/**
 * Show queue setup progress
 */
export function showQueueSetupProgress(
  progress: ProgressDisplay,
  message: string = 'Setting up event queue...'
): void {
  progress.setStatus(DEPLOYMENT_ICONS.QUEUE, message);
  progress.render();
}

/**
 * Show bootstrap progress
 */
export function showBootstrapProgress(
  progress: ProgressDisplay,
  message: string = 'Bootstrapping environment...'
): void {
  progress.setStatus(DEPLOYMENT_ICONS.BOOTSTRAP, message);
  progress.render();
}
