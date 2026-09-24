import { useState } from 'react';
import { Building2, Landmark } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './CreateChannelPartner.css';
import invalidateLeadCache from './utils/invalidateLeadCache';
import {
  Button, DEFAULT_DIAL, emailError, normalizeEmail,
  RecordCard, RecordColumn, RecordField, RecordFields, RecordFileField,
  RecordGrid, RecordPage, RecordPhoneField,
} from './ui';

const CP_TYPES = [
  { value: 'Broker', label: 'Broker' },
  { value: 'Agency', label: 'Agency' },
  { value: 'Individual', label: 'Individual' },
];

export default function CreateChannelPartner() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    typeOfChannelPartner: '',
    companyName: '',
    ownerName: '',
    mobileNumber: '',
    officeLandline: '',
    emailAddress: '',
    companyRegistrationNumber: '',
    registeredAddress: '',
    communicationAddress: '',
    message: '',
    websiteUrl: '',
    aadhaarNumber: '',
    panOfCompany: '',
    gstRegistrationNumber: '',
    reraRegistrationNumber: '',
    uploadAadhaarCopy: '',
    uploadPanCopy: '',
    uploadGstCopy: '',
    uploadReraCopy: '',
    accountDetails: {
      beneficiaryBankName: '',
      beneficiaryName: '',
      bankAccountNumber: '',
      ifscCode: ''
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const badEmail = emailError(formData.emailAddress, { required: true, label: 'Email address' });
    if (badEmail) { window.appAlert(badEmail); return; }
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/channel-partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, emailAddress: normalizeEmail(formData.emailAddress) })
      });
      if (response.ok) {
        // A new channel partner can be referenced by leads, so refresh every
        // lead view (lists, tabs, dashboard) without a browser refresh.
        invalidateLeadCache();
        navigate('/channel-partners');
      } else {
        const errData = await response.json();
        window.appAlert(errData.message || 'Failed to register channel partner');
      }
    } catch (error) {
      console.error('Error creating channel partner:', error);
      window.appAlert('Network error while registering channel partner.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const set = (name) => (value) => setFormData((prev) => ({ ...prev, [name]: value }));
  const setAcc = (name) => (value) => setFormData((prev) => ({
    ...prev,
    accountDetails: { ...prev.accountDetails, [name]: value },
  }));
  const acc = formData.accountDetails || {};

  return (
    <RecordPage
      crumbs={[{ label: 'Channel Partners', to: '/channel-partners' }]}
      title="Create New Channel Partners"
      backTo="/channel-partners"
      backLabel="Back to Partners"
    >
      <form onSubmit={handleSubmit}>
        <RecordGrid cols={1}>
          <RecordColumn>
            <RecordCard icon={Building2} title="Create New Channel Partners">
              <RecordFields>
                <RecordField
                  label="Type Of Channel Partner :"
                  options={CP_TYPES}
                  placeholder="Select Type Of Channel Partner"
                  value={formData.typeOfChannelPartner}
                  onChange={set('typeOfChannelPartner')}
                />
                <RecordField label="Company Name :" required placeholder="Company Name*" value={formData.companyName} onChange={set('companyName')} />
                <RecordField label="Owner/Partner's Name :" required placeholder="Owner/Partner's Name*" value={formData.ownerName} onChange={set('ownerName')} />
                <RecordPhoneField
                  label="Mobile Number :"
                  required
                  name="mobileNumber"
                  countryName="mobileCountryCode"
                  value={formData.mobileNumber}
                  dial={formData.mobileCountryCode || DEFAULT_DIAL}
                  onSave={(num, code) => setFormData((prev) => ({ ...prev, mobileNumber: num, mobileCountryCode: code }))}
                />
                <RecordField
                  label="Office Landline Number :"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Office Landline Number (Optional)"
                  value={formData.officeLandline}
                  onChange={set('officeLandline')}
                />
                <RecordField
                  label="Email Address :"
                  type="email"
                  required
                  value={formData.emailAddress}
                  onChange={set('emailAddress')}
                  normalize={normalizeEmail}
                  validate={(v) => emailError(v, { label: 'Email address' })}
                />
                <RecordField
                  label="Company Registration Number :"
                  required
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Company/Firm Registration Number*"
                  value={formData.companyRegistrationNumber}
                  onChange={set('companyRegistrationNumber')}
                />
                <RecordField label="Registered Address :" required multiline placeholder="Registered Address*" value={formData.registeredAddress} onChange={set('registeredAddress')} />
                <RecordField label="Communication Address :" multiline placeholder="Communication Address" value={formData.communicationAddress} onChange={set('communicationAddress')} />
                <RecordField label="Message :" required multiline placeholder="Message*" value={formData.message} onChange={set('message')} />
                <RecordField label="Website URL :" required placeholder="Website URL*" value={formData.websiteUrl} onChange={set('websiteUrl')} />
                <RecordField
                  label="Aadhaar Number :"
                  required
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Aadhaar Number*"
                  value={formData.aadhaarNumber}
                  onChange={set('aadhaarNumber')}
                />
                <RecordFileField label="Upload Aadhaar Copy :" value={formData.uploadAadhaarCopy} onSave={set('uploadAadhaarCopy')} />
                <RecordField label="PAN of the Company :" required placeholder="PAN of the Company*" value={formData.panOfCompany} onChange={set('panOfCompany')} />
                <RecordFileField label="Upload PAN copy :" value={formData.uploadPanCopy} onSave={set('uploadPanCopy')} />
                <RecordField label="GST Registration Number :" placeholder="GST Registration Number" value={formData.gstRegistrationNumber} onChange={set('gstRegistrationNumber')} />
                <RecordFileField label="Upload GST copy :" value={formData.uploadGstCopy} onSave={set('uploadGstCopy')} />
                <RecordField
                  label="RERA Registration Number :"
                  required
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="RERA Registration Number*"
                  value={formData.reraRegistrationNumber}
                  onChange={set('reraRegistrationNumber')}
                />
                <RecordFileField label="Upload RERA copy :" value={formData.uploadReraCopy} onSave={set('uploadReraCopy')} />
              </RecordFields>
            </RecordCard>

            <RecordCard icon={Landmark} title="Account Details">
              <RecordFields>
                <RecordField label="Beneficiary Bank Name :" required placeholder="Beneficiary Bank Name*" value={acc.beneficiaryBankName} onChange={setAcc('beneficiaryBankName')} />
                <RecordField
                  label="Bank Account No. :"
                  required
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Bank Account No.*"
                  value={acc.bankAccountNumber}
                  onChange={setAcc('bankAccountNumber')}
                />
                <RecordField label="Beneficiary Name :" required placeholder="Beneficiary Name*" value={acc.beneficiaryName} onChange={setAcc('beneficiaryName')} />
                <RecordField label="IFSC code :" required placeholder="IFSC code*" value={acc.ifscCode} onChange={setAcc('ifscCode')} />
              </RecordFields>

              <div className="nx-rec-card__actions">
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Registering...' : 'Register Channel Partners'}
                </Button>
              </div>
            </RecordCard>
          </RecordColumn>
        </RecordGrid>
      </form>
    </RecordPage>
  );
}
