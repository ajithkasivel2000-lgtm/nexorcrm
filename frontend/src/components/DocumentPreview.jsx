import { useEffect, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { Button, Modal, toast } from '../ui';
import { previewLeadsDocument } from '../utils/LeadsDocument';
import './DocumentPreview.css';

/**
 * Shows an Leads document on screen instead of saving it.
 *
 * Downloading first and opening it afterwards means a file on disk for every
 * record somebody merely wanted to glance at. The document is rendered here,
 * with saving left as a deliberate second step.
 *
 * @param {object|null} lead  the lead to show; null closes the preview
 */
export default function DocumentPreview({ lead, onClose }) {
  const [state, setState] = useState({ status: 'idle' });

  useEffect(() => {
    if (!lead) {
      setState({ status: 'idle' });
      return undefined;
    }

    let live = true;
    let built = null;

    setState({ status: 'building' });
    previewLeadsDocument(lead)
      .then((result) => {
        built = result;
        // Nobody is watching any more; let go of the blob rather than
        // leaving it held by a closed preview.
        if (!live) { result.release(); return; }
        setState({ status: 'ready', ...result });
      })
      .catch((error) => {
        console.error('Could not build the Leads document', error);
        if (live) setState({ status: 'failed', message: error?.message });
      });

    return () => {
      live = false;
      if (built) built.release();
    };
  }, [lead]);

  const save = () => {
    if (state.status !== 'ready') return;
    state.save();
    toast.success(`Saved ${state.filename}`);
  };

  return (
    <Modal
      open={Boolean(lead)}
      onClose={onClose}
      size="xl"
      title={lead?.name ? `Leads — ${lead.name}` : 'Leads'}
      description={state.status === 'ready' ? state.filename : 'Preparing the document…'}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            icon={Download}
            onClick={save}
            disabled={state.status !== 'ready'}
          >
            Download
          </Button>
        </>
      }
    >
      <div className="nx-docpreview">
        {state.status === 'building' && (
          <p className="nx-docpreview__note">
            <Loader2 size={16} className="nx-docpreview__spin" aria-hidden="true" />
            Building the document…
          </p>
        )}

        {state.status === 'failed' && (
          <p className="nx-docpreview__note nx-docpreview__note--error">
            <FileText size={16} aria-hidden="true" />
            {state.message || 'The document could not be built.'}
          </p>
        )}

        {state.status === 'ready' && (
          <iframe
            className="nx-docpreview__frame"
            src={state.url}
            title={`Leads document for ${lead?.name || 'this lead'}`}
          />
        )}
      </div>
    </Modal>
  );
}
