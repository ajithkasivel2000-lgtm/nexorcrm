/**
 * Error monitoring.
 *
 * With SENTRY_DSN set, unexpected errors (a 500 from any route, a crash in a
 * background job, an unhandled rejection) are sent to Sentry with the company
 * and user attached, so a problem one customer hits is visible without them
 * having to report it. Without SENTRY_DSN nothing is sent anywhere and errors
 * are only logged — the default for local work.
 */
let Sentry = null;

function initMonitoring() {
  if (!process.env.SENTRY_DSN) return false;
  Sentry = require('@sentry/node');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    // Request bodies can hold passwords and customer data: never send them.
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) { delete event.request.data; delete event.request.cookies; }
      if (event.request?.headers) { delete event.request.headers.authorization; delete event.request.headers['x-auth-token']; }
      return event;
    },
  });
  console.log('[monitoring] Sentry enabled');
  return true;
}

/** Report an error, with who and which company it happened to when known. */
function captureError(error, { req, context } = {}) {
  console.error(context ? `[${context}]` : '[error]', error?.stack || error);
  if (!Sentry) return;
  Sentry.withScope((scope) => {
    if (req?.companyId) scope.setTag('company', req.companyId);
    if (req?.user) scope.setUser({ id: req.user.id, username: req.user.username });
    if (req) scope.setTag('route', `${req.method} ${req.baseUrl || ''}${req.route?.path || req.path}`);
    if (context) scope.setTag('context', context);
    Sentry.captureException(error);
  });
}

/** The last Express middleware: anything thrown and not answered becomes a clean 500. */
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  captureError(error, { req });
  if (res.headersSent) return;
  const status = error.status || error.statusCode || 500;
  res.status(status >= 400 && status < 600 ? status : 500).json({
    message: status < 500 ? error.message : 'Something went wrong on our side. It has been logged.',
  });
}

function installProcessHandlers() {
  process.on('unhandledRejection', (reason) => captureError(reason instanceof Error ? reason : new Error(String(reason)), { context: 'unhandledRejection' }));
  process.on('uncaughtException', (error) => {
    captureError(error, { context: 'uncaughtException' });
    // State may be corrupt after an uncaught exception: let PM2 restart us.
    setTimeout(() => process.exit(1), 1000).unref();
  });
}

module.exports = { initMonitoring, captureError, errorHandler, installProcessHandlers };
