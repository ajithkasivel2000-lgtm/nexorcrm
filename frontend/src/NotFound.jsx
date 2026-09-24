import { useLocation, useNavigate } from 'react-router-dom';
import { Compass, ArrowLeft, Home } from 'lucide-react';
import { Button, Page } from './ui';
import './NotFound.css';

/**
 * Shown for any URL the router does not recognise.
 *
 * Without this the app rendered nothing at all for an unknown path — not even
 * the sidebar — leaving a blank screen whose only clue was a console warning.
 * It sits inside the dashboard layout on purpose, so the navigation stays put
 * and the way out is one click away.
 */
export default function NotFound() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <Page title="Page not found">
      <div className="nx-notfound">
        <span className="nx-notfound__icon"><Compass size={30} /></span>
        <h2 className="nx-notfound__title">Nothing lives at this address</h2>
        <p className="nx-notfound__text">
          <code className="nx-notfound__path">{pathname}</code> is not a page in NexorCRM.
          It may have been renamed, or the link that brought you here may be out of date.
        </p>
        <div className="nx-notfound__actions">
          <Button variant="secondary" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} /> Go back
          </Button>
          <Button onClick={() => navigate('/')}>
            <Home size={15} /> Dashboard
          </Button>
        </div>
      </div>
    </Page>
  );
}
