const TECHNICAL_ERROR = /\b(?:axioserror|prisma|database|sql|ecconnrefused|econnreset|stack trace|internal server error)\b/i;

export default function friendlyAuthError(message, status) {
  const text = String(message || '');
  const normalized = text.toLowerCase();

  if (Number(status) >= 500 || TECHNICAL_ERROR.test(text)) {
    return 'We’re having trouble connecting to the workspace. Please try again.';
  }
  if (/invalid credentials|incorrect password|password.*not correct/.test(normalized) || Number(status) === 401) {
    return 'Email or password is incorrect.';
  }
  if (/waiting for activation|verify your email|email.*verification/.test(normalized)) {
    return 'Please verify your email address before signing in.';
  }
  if (/banned|suspended|archived|disabled|account locked|not active/.test(normalized) || Number(status) === 403) {
    return 'Your account is currently unavailable. Please contact your administrator.';
  }
  if (/company code|workspace.*not found|no company uses/.test(normalized)) {
    return 'We couldn’t find a workspace for this company link. Check the URL and try again.';
  }
  if (/more than one account/.test(normalized)) {
    return 'More than one account in this workspace uses that email. Sign in with your username.';
  }
  return 'We couldn’t sign you in. Check your details and try again.';
}
