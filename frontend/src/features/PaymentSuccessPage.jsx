import { useEffect, useState } from 'react';
import { Button, Page } from '../ui';
import { api } from './api';

export default function PaymentSuccessPage({ publicSignup = false, onReturn }) {
  const [message, setMessage] = useState('Checking your Cashfree subscription…');

  useEffect(() => {
    if (publicSignup) {
      setMessage('Cashfree returned to NexorCRM. We confirm payments securely by webhook, not from this redirect. Verify your email and sign in; your paid access appears after Cashfree confirms the payment.');
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const subscriptionId = sessionStorage.getItem('cashfreeSubscriptionId')
      || params.get('subscription_id')
      || params.get('subscriptionId');
    if (!subscriptionId) {
      setMessage('Cashfree returned to NexorCRM. Check your subscription status under Billing & Plan.');
      return;
    }
    api('/api/billing/verify', { method: 'POST', body: { subscriptionId } })
      .then((result) => {
        setMessage(result.message);
        if (!result.pending) sessionStorage.removeItem('cashfreeSubscriptionId');
      })
      .catch((error) => setMessage(error.message));
  }, [publicSignup]);

  return (
    <Page title="Payment status">
      <p className="fx-muted">{message}</p>
      <Button
        variant="primary"
        onClick={onReturn || (() => { window.location.assign('/settings/billing'); })}
      >
        {publicSignup ? 'Return to sign in' : 'Return to Billing &amp; Plan'}
      </Button>
    </Page>
  );
}
