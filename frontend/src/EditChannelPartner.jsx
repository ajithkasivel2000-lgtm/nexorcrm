import { useState, useEffect, useCallback } from 'react';
import { PartnerLoginsPanel } from './features/PartnerPortal';
import { useParams } from 'react-router-dom';
import { useRecordTitle } from './hooks/usePageMeta';
import { Building2, FileText, Landmark, Users } from 'lucide-react';
import './EditChannelPartner.css';
import invalidateLeadCache from './utils/invalidateLeadCache';
import {
  emailError, normalizeEmail,
  RecordCard, RecordColumn, RecordField, RecordFields, RecordFileField,
  RecordGrid, RecordPage, RecordTimeline, recordStamp,
} from './ui';

const CP_TABS = [
  { key: 'CP Details', icon: Building2 },
  { key: 'CP Leads', icon: Users },
];

const CP_TYPES = ['Company', 'Individual', 'Partnership Firm', 'LLP', 'TRUST', 'HUF'];

export default function EditChannelPartner() {
  const { id } = useParams();
  const [cp, setCp] = useState(null);

  // The tab says which record is open, not just which kind.
  useRecordTitle(cp?.channelPartnerName || cp?.companyName);
  const [activeTab, setActiveTab] = useState('CP Details');
  const [usersList, setUsersList] = useState([]);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setUsersList(data.map(u => u.username).filter(Boolean));
        }
      }
    } catch (error) {
      console.error('Failed to fetch users list:', error);
    }
  }, []);

  const fetchCP = useCallback(async () => {
    try {
      const response = await fetch(`/api/channel-partners/${id}`);
      if (response.ok) {
        const data = await response.json();
        setCp(data);
      }
    } catch (error) {
      console.error('Failed to fetch channel partner:', error);
    }
  }, [id]);

  /* Below the two callbacks on purpose: a dependency array is evaluated during
     render, so naming a `const` declared further down throws on first paint. */
  useEffect(() => {
    fetchCP();
    fetchUsers();
  }, [fetchCP, fetchUsers]);

  const handleSaveField = async (field, value) => {
    try {
      // Check if value actually changed before making API call
      let currentValue = '';
      if (field.startsWith('account_')) {
        const accField = field.split('_')[1];
        currentValue = cp?.accountDetails?.[accField] || cp?.[accField] || '';
      } else {
        currentValue = cp?.[field] || '';
      }

      if (String(value).trim() === String(currentValue).trim()) {
        return; // No change, do not log or make API request
      }

      const loggedInUser = localStorage.getItem('loggedInUser') || 'admin';
      let updateData = { updatedBy: loggedInUser };
      if (field.startsWith('account_')) {
        const accField = field.split('_')[1];
        updateData = {
          ...updateData,
          accountDetails: {
            ...cp.accountDetails,
            [accField]: value
          }
        };
      } else {
        updateData = { ...updateData, [field]: value };
      }

      const response = await fetch(`/api/channel-partners/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (response.ok) {
        const updated = await response.json();
        setCp(updated);
        // Leads carry the partner's name, and the lead lists filter on it, so
        // a rename here has to reach every lead view.
        invalidateLeadCache();
      }
    } catch (error) {
      console.error('Failed to update field:', error);
    }
  };

  if (!cp) return <div className="nx-rec__loading">Loading…</div>;

  const save = (name) => (value) => handleSaveField(name, value);
  const acc = cp.accountDetails || {};

  const logEntries = (cp.logs && cp.logs.length > 0
    ? [...cp.logs].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
    : [{ id: 'created', title: 'Channelpartners Created', subtitle: 'by admin', date: cp.createdAt }]
  ).map((l) => ({
    id: l.id,
    title: l.title,
    subtitle: l.subtitle,
    date: recordStamp(l.date || l.createdAt),
  }));

  return (
    <RecordPage
      crumbs={[{ label: 'Channel Partners', to: '/channel-partners' }]}
      title={cp.channelPartnerName || cp.companyName || 'Channel Partner'}
      backTo="/channel-partners"
      backLabel="Back to Partners"
      tabs={CP_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      <RecordGrid cols={3}>
        <RecordColumn className="nx-rec__col--wide">
          {activeTab === 'CP Details' && (
            <>
              <RecordCard icon={Building2} title="Channel Partners">
                <RecordFields>
                  <RecordField
                    label="Lead Owner Changed"
                    options={usersList.length > 0 ? usersList : ['admin', 'manager', 'user']}
                    value={cp.leadOwner || 'admin'}
                    onSave={save('leadOwner')}
                  />
                  <RecordField
                    label="Type Of Channel Partner"
                    options={CP_TYPES}
                    value={cp.typeOfChannelPartner}
                    onSave={save('typeOfChannelPartner')}
                  />
                  <RecordField label="Message" value={cp.message} onSave={save('message')} />
                  <RecordField label="Company Name" value={cp.companyName} onSave={save('companyName')} />
                  <RecordField label="Website URL" value={cp.websiteUrl} onSave={save('websiteUrl')} />
                  <RecordField label="Owner/Partner's Name" value={cp.ownerName} onSave={save('ownerName')} />
                  <RecordField label="Aadhaar Number" value={cp.aadhaarNumber} onSave={save('aadhaarNumber')} />
                  <RecordField label="Mobile Number" value={cp.mobileNumber} onSave={save('mobileNumber')} />
                  <RecordFileField label="Upload Aadhaar Copy" value={cp.uploadAadhaarCopy} onSave={save('uploadAadhaarCopy')} />
                  <RecordField label="Office Landline Number" value={cp.officeLandline} onSave={save('officeLandline')} />
                  <RecordField label="PAN of the Company" value={cp.panOfCompany} onSave={save('panOfCompany')} />
                  <RecordField
                    label="Email Address"
                    type="email"
                    value={cp.emailAddress}
                    normalize={normalizeEmail}
                    validate={(v) => emailError(v, { label: 'Email address' })}
                    onSave={save('emailAddress')}
                  />
                  <RecordFileField label="Upload PAN copy" value={cp.uploadPanCopy} onSave={save('uploadPanCopy')} />
                  <RecordField label="Company Registration Number" value={cp.companyRegistrationNumber} onSave={save('companyRegistrationNumber')} />
                  <RecordField label="GST Registration Number" value={cp.gstRegistrationNumber} onSave={save('gstRegistrationNumber')} />
                  <RecordField label="Registered Address" value={cp.registeredAddress} onSave={save('registeredAddress')} />
                  <RecordFileField label="Upload GST copy" value={cp.uploadGstCopy} onSave={save('uploadGstCopy')} />
                  <RecordField label="Communication Address" value={cp.communicationAddress} onSave={save('communicationAddress')} />
                  <RecordField label="RERA Registration Number" value={cp.reraRegistrationNumber} onSave={save('reraRegistrationNumber')} />
                  <RecordFileField label="Upload RERA copy" value={cp.uploadReraCopy} onSave={save('uploadReraCopy')} />
                </RecordFields>
              </RecordCard>

              <RecordCard icon={Landmark} title="Account Details">
                <RecordFields>
                  <RecordField label="Beneficiary Bank Name" value={acc.beneficiaryBankName} onSave={save('account_beneficiaryBankName')} />
                  <RecordField label="Bank Account No." value={acc.bankAccountNumber} onSave={save('account_bankAccountNumber')} />
                  <RecordField label="Beneficiary Name" value={acc.beneficiaryName} onSave={save('account_beneficiaryName')} />
                  <RecordField label="IFSC code" value={acc.ifscCode} onSave={save('account_ifscCode')} />
                </RecordFields>
              </RecordCard>
            </>
          )}

          {activeTab === 'CP Leads' && (
            <RecordCard icon={Users} title="CP Leads">
              <p className="nx-rec-log__empty">No leads assigned to this channel partner yet.</p>
            </RecordCard>
          )}
          {/* Portal logins for this partner (administrators only; hidden otherwise). */}
          <PartnerLoginsPanel channelPartnerId={id} defaultEmail={cp.emailAddress} />
        </RecordColumn>

        <RecordColumn className="nx-rec__col--side">
          <RecordCard icon={FileText} title="Channelpartners Log">
            <RecordTimeline entries={logEntries} emptyMessage="Nothing recorded yet." />
          </RecordCard>
        </RecordColumn>
      </RecordGrid>
    </RecordPage>
  );
}
