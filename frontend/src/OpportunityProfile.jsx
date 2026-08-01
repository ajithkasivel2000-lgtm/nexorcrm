import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Home, Edit, Check } from 'lucide-react';
import './OpportunityProfile.css';

import { ChevronDown, RefreshCcw } from 'lucide-react';

const EditableField = ({ label, initialValue, name, onChange, isSelect = false, options = [], type="text", readOnly = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue || '');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    setValue(initialValue || '');
  }, [initialValue]);

  const handleSave = () => {
    setIsEditing(false);
    setDropdownOpen(false);
    onChange(name, value);
  };

  const handleSelect = (opt) => {
    setValue(opt);
    setDropdownOpen(false);
  };

  return (
    <div className="editable-field">
      <label>{label}</label>
      <div className="field-content" style={{ position: 'relative' }}>
        {isEditing ? (
          isSelect ? (
            <>
              <div 
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', height: '100%', outline: 'none' }}
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                <span>{value || `Select ${label.replace(' :', '')}`}</span>
                <ChevronDown size={14} color="#888" />
              </div>
              {dropdownOpen && (
                <div className="custom-dropdown-list" style={{ position: 'absolute', top: '100%', left: 0, width: '100%', zIndex: 10, background: '#fff', border: '1px solid #ccc', borderRadius: '4px', marginTop: '4px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                  <div 
                    className="custom-dropdown-item" 
                    style={{ padding: '8px 12px', fontSize: '13px', color: '#333', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                    onClick={() => handleSelect('')}
                  >
                    Select {label.replace(' :', '')}
                  </div>
                  {options.map(opt => (
                    <div 
                      key={opt} 
                      className="custom-dropdown-item" 
                      style={{ padding: '8px 12px', fontSize: '13px', color: '#333', cursor: 'pointer', background: value === opt ? '#1967d2' : 'transparent', color: value === opt ? '#fff' : '#333' }}
                      onClick={() => handleSelect(opt)}
                      onMouseEnter={(e) => { if(value !== opt) { e.target.style.background = '#f5f5f5'; } }}
                      onMouseLeave={(e) => { if(value !== opt) { e.target.style.background = 'transparent'; } }}
                    >
                      {opt}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <input 
              type={type} 
              value={value} 
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent' }}
            />
          )
        ) : (
          <div className="value-display" style={{ flex: 1 }}>{value || '---'}</div>
        )}
        {!readOnly && (
          <button 
            className="btn-edit-inline" 
            onClick={() => {
              if (isEditing) {
                handleSave();
              } else {
                setIsEditing(true);
              }
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 5px' }}
          >
            {isEditing ? (
              isSelect ? <RefreshCcw size={14} color="#555" /> : <Check size={12} color="green" />
            ) : (
              <Edit size={12} color="#666" />
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default function OpportunityProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [opportunity, setOpportunity] = useState(null);
  const [activeTab, setActiveTab] = useState('Source Information');
  const [activeLogTab, setActiveLogTab] = useState('Opp Log');

  useEffect(() => {
    fetchOpportunity();
  }, [id]);

  const fetchOpportunity = async () => {
    try {
      const response = await fetch(`/api/opportunities/${id}`);
      if (response.ok) {
        const data = await response.json();
        setOpportunity(data);
      }
    } catch (error) {
      console.error('Failed to fetch opportunity:', error);
    }
  };

  const handleFieldUpdate = async (name, value) => {
    try {
      const response = await fetch(`/api/opportunities/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          [name]: value,
          logEntry: {
            title: `Updated ${name.replace(/([A-Z])/g, ' $1').trim().replace(/^./, str => str.toUpperCase())}`,
            subtitle: `by admin to "${value}"`
          }
        })
      });
      if (response.ok) {
        fetchOpportunity();
      }
    } catch (error) {
      console.error('Failed to update field:', error);
    }
  };

  if (!opportunity) return <div className="loading">Loading...</div>;

  return (
    <div className="opportunity-profile-page">
      <div className="profile-header">
        <div className="page-breadcrumb">
          <Home size={14} style={{cursor: 'pointer'}} onClick={() => navigate('/')} /> 
          <span className="slash">/</span> 
          <span className="current" onClick={() => navigate('/opportunities')} style={{cursor: 'pointer', color: '#8c6cf5', fontWeight: '500'}}>Opportunity List</span>
          <span className="slash">/</span> 
          <span className="current" style={{cursor: 'default', color: '#8c6cf5', fontWeight: '500'}}>Opportunity Edit</span>
        </div>
      </div>

      <div className="profile-content-wrapper">
        <div className="profile-main">
          
          <div className="info-section top-info">
            <div className="info-column">
              <EditableField label="Opportunity Id :" name="oppId" initialValue={opportunity.oppId} onChange={handleFieldUpdate} readOnly={true} />
              <EditableField label="Opportunity Name :" name="opportunityName" initialValue={opportunity.opportunityName} onChange={handleFieldUpdate} />
              <EditableField label="Mobile Number :" name="mobileNumber" initialValue={opportunity.mobileNumber} onChange={handleFieldUpdate} />
              <EditableField label="Email Address :" name="emailAddress" initialValue={opportunity.emailAddress} onChange={handleFieldUpdate} />
              <EditableField label="Enquiry Project :" name="enquiryProject" initialValue={opportunity.enquiryProject} onChange={handleFieldUpdate} />
              <EditableField label="Alternate Mobile No. :" name="alternateMobile" initialValue={opportunity.alternateMobile} onChange={handleFieldUpdate} />
              <EditableField label="Alternate Email :" name="alternateEmail" initialValue={opportunity.alternateEmail} onChange={handleFieldUpdate} />
              <EditableField label="Occupation :" name="occupation" initialValue={opportunity.occupation} onChange={handleFieldUpdate} />
              <EditableField label="Company Name :" name="companyName" initialValue={opportunity.companyName} onChange={handleFieldUpdate} />
            </div>

            <div className="info-column">
              <EditableField label="Allocator :" name="allocator" initialValue="admin" onChange={handleFieldUpdate} readOnly={true} />
              <EditableField label="Opportunity Owner :" name="opportunityOwner" initialValue={opportunity.opportunityOwner} onChange={handleFieldUpdate} />
              <EditableField 
                label="Stage :" 
                name="stage" 
                initialValue={opportunity.stage} 
                isSelect={true} 
                options={['Site Visit Converted', 'Negotiation', 'Closed Won', 'Closed Lost']}
                onChange={handleFieldUpdate} 
              />
              <EditableField label="Selected Unit :" name="selectedUnit" initialValue={opportunity.selectedUnit} onChange={handleFieldUpdate} />
              <EditableField 
                label="Unit Type :" 
                name="unitType" 
                initialValue={opportunity.unitType} 
                isSelect={true}
                options={['Flat', 'Villa', 'Plot']}
                onChange={handleFieldUpdate} 
              />
              <EditableField label="Booking Date :" name="bookingDate" type="date" initialValue={opportunity.bookingDate ? opportunity.bookingDate.split('T')[0] : ''} onChange={handleFieldUpdate} />
              <EditableField label="Booking Details :" name="bookingDetails" initialValue={opportunity.bookingDetails} onChange={handleFieldUpdate} />
              <EditableField label="Booking Amount :" name="bookingAmount" initialValue={opportunity.bookingAmount} onChange={handleFieldUpdate} />
              <EditableField 
                label="Booking Amount Status :" 
                name="bookingAmountStatus" 
                initialValue={opportunity.bookingAmountStatus} 
                isSelect={true}
                options={['Fully Paid', 'Partially Paid']}
                onChange={handleFieldUpdate} 
              />
              <EditableField label="Booking Done Date :" name="bookingDoneDate" type="date" initialValue={opportunity.bookingDoneDate ? opportunity.bookingDoneDate.split('T')[0] : ''} onChange={handleFieldUpdate} />
              <EditableField label="Comments :" name="comments" initialValue={opportunity.comments} onChange={handleFieldUpdate} />
              <EditableField label="Reporting Manager :" name="reportingManager" initialValue={opportunity.reportingManager} onChange={handleFieldUpdate} />
              <EditableField label="CP Commission % :" name="cpCommissionPercent" initialValue={opportunity.cpCommissionPercent} onChange={handleFieldUpdate} />
              <EditableField label="Approval Stage :" name="approvalStage" initialValue={opportunity.approvalStage} onChange={handleFieldUpdate} />
            </div>
          </div>

          <div className="bottom-tabs">
            <button className={`bottom-tab ${activeTab === 'Agreement & Invoice Details' ? 'active' : ''}`} onClick={() => setActiveTab('Agreement & Invoice Details')}>
               Agreement & Invoice Details
            </button>
            <button className={`bottom-tab ${activeTab === 'Source Information' ? 'active' : ''}`} onClick={() => setActiveTab('Source Information')}>
               Source Information
            </button>
          </div>

          {activeTab === 'Source Information' && (
            <div className="info-section bottom-info">
              <div className="info-column">
                <EditableField label="Preferred Budget :" name="preferredBudget" initialValue={opportunity.preferredBudget} onChange={handleFieldUpdate} />
                <EditableField label="Preferred Locality :" name="preferredLocality" initialValue={opportunity.preferredLocality} onChange={handleFieldUpdate} />
                <EditableField label="Location Commission :" name="locationCommission" initialValue={opportunity.locationCommission} onChange={handleFieldUpdate} />
              </div>
              <div className="info-column">
                <EditableField label="Channel Partner Name :" name="channelPartnerName" initialValue={opportunity.channelPartnerName} onChange={handleFieldUpdate} />
                <EditableField label="Channel Partner ID :" name="channelPartnerId" initialValue={opportunity.channelPartnerId} onChange={handleFieldUpdate} />
                <EditableField label="Location Commission (INR) :" name="locationCommissionInr" initialValue={opportunity.locationCommissionInr} onChange={handleFieldUpdate} />
              </div>
            </div>
          )}
          
          {activeTab === 'Agreement & Invoice Details' && (
             <div className="info-section bottom-info">
                <div style={{color: '#888', fontSize: '13px', padding: '10px 0'}}>No agreement details available.</div>
             </div>
          )}

        </div>

        <div className="profile-sidebar">
          <div className="sidebar-tabs">
            <button className={`sidebar-tab ${activeLogTab === 'Opp Log' ? 'active' : ''}`} onClick={() => setActiveLogTab('Opp Log')}>Opp Log</button>
          </div>
          
          {activeLogTab === 'Opp Log' && (
            <div className="log-list">
              {opportunity.logs && [...opportunity.logs]
                .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
                .map(log => (
                  <div className="log-item" key={log.id}>
                    <div className="log-avatar-img">
                      <img src="https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=f0ecfc" alt="avatar" />
                    </div>
                    <div className="log-content">
                      <p>{log.title}</p>
                      <span>{log.subtitle}</span>
                      <span className="log-date">on {new Date(log.date || log.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              <div className="log-item">
                <div className="log-avatar-img">
                  <img src="https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=f0ecfc" alt="avatar" />
                </div>
                <div className="log-content">
                  <p>Lead To Opportunity</p>
                  <span>by admin</span>
                  <span className="log-date">on {new Date(opportunity.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
