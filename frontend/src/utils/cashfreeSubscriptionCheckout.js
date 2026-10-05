let sdkPromise;

export function loadCashfree() {
  if (window.Cashfree) return Promise.resolve(window.Cashfree);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.onload = () => {
      if (window.Cashfree) resolve(window.Cashfree);
      else {
        sdkPromise = null;
        reject(new Error('Cashfree checkout did not initialize. Refresh and try again.'));
      }
    };
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error('Could not load Cashfree checkout. Check your connection.'));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}

export async function startCashfreeSubscriptionCheckout(mode, subscriptionSessionId) {
  if (typeof subscriptionSessionId !== 'string' || !subscriptionSessionId.trim()) {
    throw new Error('Cashfree did not return a subscription checkout session. Please try again.');
  }
  const Cashfree = await loadCashfree();
  const cashfree = Cashfree({ mode });
  if (typeof cashfree.subscriptionsCheckout !== 'function') {
    throw new Error('The Cashfree subscription checkout SDK did not load correctly. Refresh and try again.');
  }
  const result = await cashfree.subscriptionsCheckout({
    subsSessionId: subscriptionSessionId,
    redirectTarget: '_self',
  });
  if (result?.error) {
    throw new Error(result.error.message || 'Cashfree checkout was not completed.');
  }
  return result;
}
