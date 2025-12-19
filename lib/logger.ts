/**
 * Centralized logging utility
 * Only logs in development, silent in production
 * 
 * For production error tracking, consider adding:
 * - Sentry: npm install @sentry/nextjs
 * - LogRocket: npm install logrocket
 * - Vercel Analytics (built-in for Vercel deployments)
 */

const isDev = process.env.NODE_ENV === 'development';

interface LogContext {
    [key: string]: unknown;
}

/**
 * Log debug information (development only)
 */
export function logDebug(message: string, context?: LogContext): void {
    if (isDev) {
        console.log(`[DEBUG] ${message}`, context || '');
    }
}

/**
 * Log informational messages (development only)
 */
export function logInfo(message: string, context?: LogContext): void {
    if (isDev) {
        console.info(`[INFO] ${message}`, context || '');
    }
}

/**
 * Log warnings (development only)
 */
export function logWarn(message: string, context?: LogContext): void {
    if (isDev) {
        console.warn(`[WARN] ${message}`, context || '');
    }
}

/**
 * Log errors (always logs, but could be sent to error tracking service)
 */
export function logError(message: string, error?: Error | unknown, context?: LogContext): void {
    // In production, you could send this to Sentry, LogRocket, etc.
    // For now, just log in development
    if (isDev) {
        console.error(`[ERROR] ${message}`, { error, ...context });
    }

    // TODO: Add production error tracking
    // if (!isDev && typeof window !== 'undefined') {
    //     Sentry.captureException(error, { extra: { message, ...context } });
    // }
}

/**
 * Log API request/response for debugging
 */
export function logApi(method: string, path: string, status: number, durationMs?: number): void {
    if (isDev) {
        const duration = durationMs ? ` (${durationMs}ms)` : '';
        console.log(`[API] ${method} ${path} → ${status}${duration}`);
    }
}

/**
 * Track user action for analytics
 */
export function trackAction(action: string, data?: LogContext): void {
    if (isDev) {
        console.log(`[TRACK] ${action}`, data || '');
    }

    // TODO: Add analytics
    // if (typeof window !== 'undefined') {
    //     gtag('event', action, data);
    // }
}
