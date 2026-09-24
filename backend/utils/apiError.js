/**
 * One way to answer a failed request.
 *
 * Every controller used to do `res.status(500).json({ message, error: err.message })`.
 * Two things were wrong with that:
 *
 *   1. The status was always 500, even when the real problem was "that record
 *      is gone" (404) or "that name is taken" (409). The UI could only say
 *      "Failed to delete" and leave the user guessing.
 *
 *   2. `err.message` from Prisma is a multi-line dump containing the failing
 *      query and the absolute path of the source file. That went straight into
 *      an alert box in the browser.
 *
 * The full error is still logged server-side, where it belongs.
 */

/** Prisma's error codes, mapped to what actually happened. */
const PRISMA_CODES = {
  P2000: { status: 400, message: 'One of the values is too long for its field.' },
  P2001: { status: 404, message: 'That record no longer exists.' },
  P2002: { status: 409, message: 'That value is already taken.' },
  P2003: { status: 400, message: 'That change refers to something that no longer exists.' },
  P2011: { status: 400, message: 'A required value is missing.' },
  P2014: { status: 400, message: 'That change would break a link to another record.' },
  P2025: { status: 404, message: 'That record no longer exists.' },
};

/**
 * Works out the right status and a message safe to show a user.
 * Returns null when the error is not one Prisma raised.
 */
function classify(error) {
  if (!error) return null;

  const mapped = PRISMA_CODES[error.code];
  if (mapped) {
    // P2002 knows which field collided, which is worth saying out loud.
    if (error.code === 'P2002' && error.meta?.target) {
      const fields = [].concat(error.meta.target).join(', ');
      return { status: 409, message: `A record with that ${fields} already exists.` };
    }
    return mapped;
  }

  // A malformed query — usually a field the schema does not have.
  if (error.name === 'PrismaClientValidationError') {
    return { status: 400, message: 'Some of the submitted fields are not valid.' };
  }

  return null;
}

/**
 * Sends a failure response.
 *
 * @param {object} res        the Express response
 * @param {Error}  error      the error that was caught
 * @param {string} fallback   what to say when the error is not recognised
 * @param {number} [status=500] the status to use for an unrecognised error
 */
function sendError(res, error, fallback, status = 500) {
  // The whole thing, including the stack, goes to the server log.
  console.error(`${fallback}:`, error);

  const known = classify(error);
  if (known) return res.status(known.status).json({ message: known.message });

  // Unexpected failures go to monitoring (Sentry when configured).
  if (status >= 500) require('./monitoring').captureError(error, { req: res.req, context: fallback });
  return res.status(status).json({ message: fallback });
}

module.exports = { sendError, classify };
