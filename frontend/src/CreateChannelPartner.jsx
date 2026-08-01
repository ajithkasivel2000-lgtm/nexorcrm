import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './CreateChannelPartner.css';

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

  const handleChange = (e) => {
    const { name } = e.target;
    let { value } = e.target;

    // Enforce numbers-only for Mobile Number, RERA Registration Number, Aadhaar Number, Office Landline, Company Registration Number, Bank Account Number
    if (['mobileNumber', 'reraRegistrationNumber', 'aadhaarNumber', 'officeLandline', 'companyRegistrationNumber', 'account_bankAccountNumber'].includes(name)) {
      value = value.replace(/\D/g, '');
    }

    if (name.startsWith('account_')) {
      const field = name.split('_')[1];
      setFormData(prev => ({
        ...prev,
        accountDetails: {
          ...prev.accountDetails,
          [field]: value
        }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = (e) => {
    const { name, files } = e.target;
    if (files && files.length > 0) {
      setFormData(prev => ({
        ...prev,
        [name]: files[0].name
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/channel-partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        navigate('/channel-partners');
      } else {
        const errData = await response.json();
        alert(errData.message || 'Failed to register channel partner');
      }
    } catch (error) {
      console.error('Error creating channel partner:', error);
      alert('Network error while registering channel partner.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="create-cp-page">
      <div className="create-cp-header-card">
        <h2>Create New Channel Partners</h2>
        <div className="page-breadcrumb">
          <Link to="/channel-partners" className="breadcrumb-link">Channel Partners</Link> <span className="slash">/</span> <span className="current">Create New Channel Partners</span>
        </div>
      </div>

      <div className="create-cp-card">
        <form onSubmit={handleSubmit}>
          <div className="form-main-grid">
            
            {/* Left Column */}
            <div className="form-col">
              <div className="form-row">
                <label className="form-label">Type Of Channel Partner :</label>
                <select 
                  className="form-select" 
                  name="typeOfChannelPartner" 
                  value={formData.typeOfChannelPartner} 
                  onChange={handleChange}
                  required
                >
                  <option value="">Select Type Of Channel Partner</option>
                  <option value="Broker">Broker</option>
                  <option value="Agency">Agency</option>
                  <option value="Individual">Individual</option>
                </select>
              </div>

              <div className="form-row">
                <label className="form-label">Company Name :</label>
                <input type="text" className="form-input" name="companyName" value={formData.companyName} onChange={handleChange} required placeholder="Company Name*" />
              </div>

              <div className="form-row">
                <label className="form-label">Owner/Partner's Name :</label>
                <input type="text" className="form-input" name="ownerName" value={formData.ownerName} onChange={handleChange} required placeholder="Owner/Partner's Name*" />
              </div>

              <div className="form-row">
                <label className="form-label">Mobile Number :</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="form-input" 
                  name="mobileNumber" 
                  value={formData.mobileNumber} 
                  onChange={handleChange} 
                  required 
                  placeholder="Mobile Number*" 
                />
              </div>

              <div className="form-row">
                <label className="form-label">Office Landline Number :</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="form-input" 
                  name="officeLandline" 
                  value={formData.officeLandline} 
                  onChange={handleChange} 
                  placeholder="Office Landline Number (Optional)" 
                />
              </div>

              <div className="form-row">
                <label className="form-label">Email Address :</label>
                <input type="email" className="form-input" name="emailAddress" value={formData.emailAddress} onChange={handleChange} required placeholder="Email Address*" />
              </div>

              <div className="form-row">
                <label className="form-label">Company Registration Number :</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="form-input" 
                  name="companyRegistrationNumber" 
                  value={formData.companyRegistrationNumber} 
                  onChange={handleChange} 
                  required 
                  placeholder="Company/Firm Registration Number*" 
                />
              </div>

              <div className="form-row align-top">
                <label className="form-label">Registered Address :</label>
                <textarea className="form-textarea" name="registeredAddress" value={formData.registeredAddress} onChange={handleChange} required placeholder="Registered Address*"></textarea>
              </div>

              <div className="form-row align-top">
                <label className="form-label">Communication Address :</label>
                <textarea className="form-textarea" name="communicationAddress" value={formData.communicationAddress} onChange={handleChange} placeholder="Communication Address"></textarea>
              </div>
            </div>

            {/* Right Column */}
            <div className="form-col">
              <div className="form-row align-top">
                <label className="form-label">Message :</label>
                <textarea className="form-textarea" style={{ height: '70px' }} name="message" value={formData.message} onChange={handleChange} required placeholder="Message*"></textarea>
              </div>

              <div className="form-row">
                <label className="form-label">Website URL :</label>
                <input type="text" className="form-input" name="websiteUrl" value={formData.websiteUrl} onChange={handleChange} required placeholder="Website URL*" />
              </div>

              <div className="form-row">
                <label className="form-label">Aadhaar Number :</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="form-input" 
                  name="aadhaarNumber" 
                  value={formData.aadhaarNumber} 
                  onChange={handleChange} 
                  required
                  placeholder="Aadhaar Number*" 
                />
              </div>

              <div className="form-row">
                <label className="form-label">Upload Aadhaar Copy :</label>
                <input type="file" className="form-file-input" name="uploadAadhaarCopy" onChange={handleFileChange} required />
              </div>

              <div className="form-row">
                <label className="form-label">PAN of the Company :</label>
                <input type="text" className="form-input" name="panOfCompany" value={formData.panOfCompany} onChange={handleChange} required placeholder="PAN of the Company*" />
              </div>

              <div className="form-row">
                <label className="form-label">Upload PAN copy :</label>
                <input type="file" className="form-file-input" name="uploadPanCopy" onChange={handleFileChange} required />
              </div>

              <div className="form-row">
                <label className="form-label">GST Registration Number :</label>
                <input type="text" className="form-input" name="gstRegistrationNumber" value={formData.gstRegistrationNumber} onChange={handleChange} placeholder="GST Registration Number" />
              </div>

              <div className="form-row">
                <label className="form-label">Upload GST copy :</label>
                <input type="file" className="form-file-input" name="uploadGstCopy" onChange={handleFileChange} />
              </div>

              <div className="form-row">
                <label className="form-label">RERA Registration Number :</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="form-input" 
                  name="reraRegistrationNumber" 
                  value={formData.reraRegistrationNumber} 
                  onChange={handleChange} 
                  required 
                  placeholder="RERA Registration Number*" 
                />
              </div>

              <div className="form-row">
                <label className="form-label">Upload RERA copy :</label>
                <input type="file" className="form-file-input" name="uploadReraCopy" onChange={handleFileChange} required />
              </div>
            </div>

          </div>

          {/* Account Details Section */}
          <div className="section-divider-container">
            <div className="section-title">Account Details</div>
          </div>

          <div className="form-account-grid">
            <div className="form-col">
              <div className="form-row">
                <label className="form-label">Beneficiary Bank Name :</label>
                <input type="text" className="form-input" name="account_beneficiaryBankName" value={formData.accountDetails.beneficiaryBankName} onChange={handleChange} required placeholder="Beneficiary Bank Name*" />
              </div>

              <div className="form-row">
                <label className="form-label">Bank Account No. :</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="form-input" 
                  name="account_bankAccountNumber" 
                  value={formData.accountDetails.bankAccountNumber} 
                  onChange={handleChange} 
                  required
                  placeholder="Bank Account No.*" 
                />
              </div>
            </div>

            <div className="form-col">
              <div className="form-row">
                <label className="form-label">Beneficiary Name :</label>
                <input type="text" className="form-input" name="account_beneficiaryName" value={formData.accountDetails.beneficiaryName} onChange={handleChange} required placeholder="Beneficiary Name*" />
              </div>

              <div className="form-row">
                <label className="form-label">IFSC code :</label>
                <input type="text" className="form-input" name="account_ifscCode" value={formData.accountDetails.ifscCode} onChange={handleChange} required placeholder="IFSC code*" />
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-register" disabled={isSubmitting}>
              {isSubmitting ? 'Registering...' : 'Register Channel Partners'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

