const CASHFREE_URLS = {
  SANDBOX: 'https://sandbox.cashfree.com/pg',
  PRODUCTION: 'https://api.cashfree.com/pg',
};

function getCashfreeConfig() {
  const environment = String(process.env.CASHFREE_ENVIRONMENT || 'SANDBOX').trim().toUpperCase();
  const expectedUrl = CASHFREE_URLS[environment];
  if (!expectedUrl) {
    throw Object.assign(new Error('CASHFREE_ENVIRONMENT must be SANDBOX or PRODUCTION.'), { status: 503 });
  }

  const apiUrl = String(process.env.CASHFREE_API_URL || expectedUrl).replace(/\/+$/, '');
  const knownCashfreeUrl = Object.values(CASHFREE_URLS).includes(apiUrl);
  if ((knownCashfreeUrl && apiUrl !== expectedUrl)
    || (process.env.NODE_ENV === 'production' && apiUrl !== expectedUrl)) {
    throw Object.assign(
      new Error(`Cashfree ${environment} must use ${expectedUrl}.`),
      { status: 503, code: 'CASHFREE_ENVIRONMENT_MISMATCH' },
    );
  }

  return {
    environment,
    apiUrl,
    mode: environment.toLowerCase(),
  };
}

module.exports = { getCashfreeConfig };
