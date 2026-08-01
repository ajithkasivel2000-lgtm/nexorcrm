import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Home, Edit, Check, Users } from 'lucide-react';
import './EditChannelPartner.css';

import { ChevronDown, RefreshCcw } from 'lucide-react';
import { Link } from 'react-router-dom';

const EditableField = ({ label, initialValue, name, onSave, isSelect = false, options = [], isFile = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue || '');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    setValue(initialValue || '');
  }, [initialValue]);

  const handleSave = () => {
    onSave(name, value);
    setIsEditing(false);
    setDropdownOpen(false);
  };

  const handleSelect = (opt) => {
    setValue(opt);
    setDropdownOpen(false);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setValue(e.target.files[0].name);
    }
  };

  return (
    <div className="editable-field-group">
      <div className="field-label">{label} :</div>
      <div className="field-value-container" style={{ position: 'relative' }}>
        {isEditing ? (
          isSelect ? (
            <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
              <div 
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', height: '100%', padding: '0 8px', border: '1px dashed #8c6cf5', background: '#f8f5ff' }}
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                <span style={{fontSize: '13px', color: '#555'}}>{value || `Select ${label}`}</span>
                <ChevronDown size={14} color="#8c6cf5" />
              </div>
              {dropdownOpen && (
                <div className="custom-dropdown-list" style={{ position: 'absolute', top: '100%', left: 0, width: '100%', zIndex: 10, background: '#fff', border: '1px solid #ccc', borderRadius: '4px', marginTop: '4px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                  <div 
                    className="custom-dropdown-item" 
                    style={{ padding: '8px 12px', fontSize: '13px', color: '#333', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                    onClick={() => handleSelect('')}
                  >
                    Select {label}
                  </div>
                  {options.map(opt => (
                    <div 
                      key={opt} 
                      className="custom-dropdown-item" 
                      style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', background: value === opt ? '#1967d2' : 'transparent', color: value === opt ? '#fff' : '#333' }}
                      onClick={() => handleSelect(opt)}
                      onMouseEnter={(e) => { if(value !== opt) { e.target.style.background = '#f5f5f5'; } }}
                      onMouseLeave={(e) => { if(value !== opt) { e.target.style.background = 'transparent'; } }}
                    >
                      {opt}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : isFile ? (
            <input 
              type="file" 
              className="field-input file-input"
              onChange={handleFileChange} 
              style={{ border: '1px dashed #8c6cf5', padding: '3px', background: '#f8f5ff', fontSize: '12px' }}
            />
          ) : (
            <input 
              type="text" 
              className="field-input"
              value={value} 
              onChange={(e) => setValue(e.target.value)} 
              autoFocus
            />
          )
        ) : (
          <div className="field-value">{value || 'NA'}</div>
        )}
        <button 
          className="edit-icon-btn" 
          onClick={isEditing ? handleSave : () => setIsEditing(true)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', outline: 'none' }}
        >
          {isEditing ? (
             (isSelect || isFile) ? <RefreshCcw size={14} color="#8c6cf5" /> : <Check size={14} className="save-icon" />
          ) : (
             <Edit size={14} />
          )}
        </button>
      </div>
    </div>
  );
};

export default function EditChannelPartner() {
  const { id } = useParams();
  const [cp, setCp] = useState(null);
  const [activeTab, setActiveTab] = useState('CP Details');
  const [usersList, setUsersList] = useState([]);

  useEffect(() => {
    fetchCP();
    fetchUsers();
  }, [id]);

  const fetchUsers = async () => {
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
  };

  const fetchCP = async () => {
    try {
      const response = await fetch(`/api/channel-partners/${id}`);
      if (response.ok) {
        const data = await response.json();
        setCp(data);
      }
    } catch (error) {
      console.error('Failed to fetch channel partner:', error);
    }
  };

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
      }
    } catch (error) {
      console.error('Failed to update field:', error);
    }
  };

  if (!cp) return <div>Loading...</div>;

  return (
    <div className="edit-cp-page">
      <div className="edit-cp-header">
        <h2>Channel Partners</h2>
        <div className="page-breadcrumb">
          <Link to="/"><Home size={14} /></Link> <span className="slash">/</span> 
          Channel Partners <span className="slash">/</span> 
          <span className="current">Edit Channel Partners</span>
        </div>
      </div>

      <div className="cp-tabs">
        <div 
          className={`cp-tab ${activeTab === 'CP Details' ? 'active' : ''}`}
          onClick={() => setActiveTab('CP Details')}
        >
          CP Details
        </div>
        <div 
          className={`cp-tab ${activeTab === 'CP Leads' ? 'active' : ''}`}
          onClick={() => setActiveTab('CP Leads')}
        >
          <Users size={16} /> CP Leads
        </div>
      </div>

      <div className="edit-cp-layout">
        
        {/* Main Form Area */}
        <div className="edit-cp-main">
          {activeTab === 'CP Details' && (
            <>
              <div style={{fontWeight: 600, color: '#333', marginBottom: '15px'}}>Channel Partners :</div>
              <div style={{ maxWidth: '500px', marginBottom: '20px' }}>
                <EditableField 
                  label="Lead Owner Changed" 
                  name="leadOwner" 
                  initialValue={cp.leadOwner || 'admin'} 
                  isSelect={true}
                  options={usersList.length > 0 ? usersList : ['admin', 'manager', 'user']}
                  onSave={handleSaveField} 
                />
              </div>

              <div className="cp-details-grid">
                <EditableField 
                  label="Type Of Channel Partner" 
                  name="typeOfChannelPartner" 
                  initialValue={cp.typeOfChannelPartner} 
                  isSelect={true}
                  options={['Company', 'Individual', 'Partnership Firm', 'LLP', 'TRUST', 'HUF']}
                  onSave={handleSaveField} 
                />
                <EditableField label="Message" name="message" initialValue={cp.message} onSave={handleSaveField} />

                <EditableField label="Company Name" name="companyName" initialValue={cp.companyName} onSave={handleSaveField} />
                <EditableField label="Website URL" name="websiteUrl" initialValue={cp.websiteUrl} onSave={handleSaveField} />

                <EditableField label="Owner/Partner's Name" name="ownerName" initialValue={cp.ownerName} onSave={handleSaveField} />
                <EditableField label="Aadhaar Number" name="aadhaarNumber" initialValue={cp.aadhaarNumber} onSave={handleSaveField} />

                <EditableField label="Mobile Number" name="mobileNumber" initialValue={cp.mobileNumber} onSave={handleSaveField} />
                <EditableField label="Upload Aadhaar Copy" name="uploadAadhaarCopy" initialValue={cp.uploadAadhaarCopy} isFile={true} onSave={handleSaveField} />

                <EditableField label="Office Landline Number" name="officeLandline" initialValue={cp.officeLandline} onSave={handleSaveField} />
                <EditableField label="PAN of the Company" name="panOfCompany" initialValue={cp.panOfCompany} onSave={handleSaveField} />

                <EditableField label="Email Address" name="emailAddress" initialValue={cp.emailAddress} onSave={handleSaveField} />
                <EditableField label="Upload PAN copy" name="uploadPanCopy" initialValue={cp.uploadPanCopy} isFile={true} onSave={handleSaveField} />

                <EditableField label="Company Registration Number" name="companyRegistrationNumber" initialValue={cp.companyRegistrationNumber} onSave={handleSaveField} />
                <EditableField label="GST Registration Number" name="gstRegistrationNumber" initialValue={cp.gstRegistrationNumber} onSave={handleSaveField} />

                <EditableField label="Registered Address" name="registeredAddress" initialValue={cp.registeredAddress} onSave={handleSaveField} />
                <EditableField label="Upload GST copy" name="uploadGstCopy" initialValue={cp.uploadGstCopy} isFile={true} onSave={handleSaveField} />

                <EditableField label="Communication Address" name="communicationAddress" initialValue={cp.communicationAddress} onSave={handleSaveField} />
                <EditableField label="RERA Registration Number" name="reraRegistrationNumber" initialValue={cp.reraRegistrationNumber} onSave={handleSaveField} />

                <div style={{gridColumn: '1 / -1'}}></div>
                <EditableField label="Upload RERA copy" name="uploadReraCopy" initialValue={cp.uploadReraCopy} isFile={true} onSave={handleSaveField} />
              </div>
              
              <div className="section-divider" style={{ textAlign: 'center', margin: '20px 0', fontWeight: 'bold', borderBottom: '1px dashed #ccc', paddingBottom: '10px' }}>Account Details</div>

              <div className="cp-details-grid">
                <EditableField label="Beneficiary Bank Name" name="account_beneficiaryBankName" initialValue={cp.accountDetails?.beneficiaryBankName} onSave={handleSaveField} />
                <EditableField label="Bank Account No." name="account_bankAccountNumber" initialValue={cp.accountDetails?.bankAccountNumber} onSave={handleSaveField} />
                
                <EditableField label="Beneficiary Name" name="account_beneficiaryName" initialValue={cp.accountDetails?.beneficiaryName} onSave={handleSaveField} />
                <EditableField label="IFSC code" name="account_ifscCode" initialValue={cp.accountDetails?.ifscCode} onSave={handleSaveField} />
              </div>
            </>
          )}

          {activeTab === 'CP Leads' && (
            <div className="text-center" style={{padding: '40px'}}>
              No leads assigned to this channel partner yet.
            </div>
          )}
        </div>

        {/* Sidebar Log */}
        <div className="edit-cp-sidebar">
          <div className="sidebar-card">
            <div className="sidebar-title">Channelpartners Log</div>
            <div className="log-list" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {cp.logs && cp.logs.length > 0 ? (
                [...cp.logs]
                  .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
                  .map((log) => (
                    <div className="log-item" key={log.id}>
                      <img src="https://ui-avatars.com/api/?name=Admin&background=random" alt="admin" className="log-avatar" />
                      <div className="log-content">
                        <strong>{log.title}</strong><br/>
                        {log.subtitle} on <br/>
                        {new Date(log.date || log.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                    </div>
                  ))
              ) : (
                <div className="log-item">
                  <img src="https://ui-avatars.com/api/?name=Admin&background=random" alt="admin" className="log-avatar" />
                  <div className="log-content">
                    <strong>Channelpartners Created</strong><br/>
                    by admin on <br/>
                    {new Date(cp.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
