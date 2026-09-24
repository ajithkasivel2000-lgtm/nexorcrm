import { Button } from '../ui';
import './features.css';

/**
 * A strip across the top of the app when the subscription needs attention:
 * the last days of a trial, a failed payment, a cancelled plan running out,
 * or — when an API call answered 402 — a lapsed subscription.
 */
export default function SubscriptionBanner({ subscription, inactiveReason, onBilling }) {
  const isAdmin = ['Admin', 'superadmin'].includes(localStorage.getItem('userStatus'));
  let text = '';
  let tone = 'var(--nx-warning-bg)';

  if (inactiveReason || (subscription && !subscription.allowed)) {
    text = inactiveReason || subscription.reason;
    tone = 'var(--nx-danger-bg)';
    if (!isAdmin) text += ' Ask your administrator to renew.';
  } else if (subscription?.state === 'trialing' && subscription.daysLeft <= 7) {
    text = `Your free trial ends in ${subscription.daysLeft} day${subscription.daysLeft === 1 ? '' : 's'}.`;
    tone = 'var(--nx-info-bg)';
  } else if (subscription?.state === 'past_due') {
    text = `Your last payment failed. Access continues for ${subscription.daysLeft} more day(s).`;
  } else if (subscription?.state === 'cancelled') {
    text = `Your subscription is cancelled and ends in ${subscription.daysLeft} day(s).`;
  }
  if (!text) return null;

  return (
    <div role="status" className="fx-row" style={{ background: tone, color: 'var(--nx-text)', padding: 'var(--nx-space-2) var(--nx-space-4)', fontSize: 'var(--nx-text-sm)' }}>
      <span className="fx-grow">{text}</span>
      {isAdmin && <Button size="sm" variant="primary" onClick={onBilling}>Billing & Plan</Button>}
    </div>
  );
}
