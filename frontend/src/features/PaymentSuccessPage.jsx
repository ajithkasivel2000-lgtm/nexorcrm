import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Page } from '../ui';
import { api } from './api';

export default function PaymentSuccessPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Checking your Cashfree subscription…');

  useEffect(() => {
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
  }, []);

  return (
    <Page title="Payment status">
      <p className="fx-muted">{message}</p>
      <Button variant="primary" onClick={() => navigate('/settings/billing')}>Return to Billing &amp; Plan</Button>
    </Page>
  );
}
