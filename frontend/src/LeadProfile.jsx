import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Home, Edit, Check, RefreshCcw, ChevronDown, X, AlertTriangle } from 'lucide-react';
import './LeadProfile.css';
import './Leads.css';

const EditableField = ({ label, initialValue, isSelect = false, options = [], inputType = "text", onSave, readOnly = false, numericOnly = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return (
    <div className="editable-field">
      <label>{label}</label>
      <div className="field-content">
        {isEditing ? (
          isSelect ? (
            <select value={value} onChange={(e) => setValue(e.target.value)} autoFocus>
              {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ) : (
            <input
              type={inputType}
              value={value}
              onChange={(e) => {
                let val = e.target.value;
                if (numericOnly) {
                  val = val.replace(/[^0-9+\s-]/g, '');
                }
                setValue(val);
              }}
              autoFocus
            />
          )
        ) : (
          <div className="value-display">
            {inputType === 'datetime-local' && value
              ? new Date(value).toLocaleString()
              : (value || '---')}
          </div>
        )}
        {!readOnly && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button
              className="btn-edit-inline"
              onClick={() => {
                if (isEditing) {
                  if (onSave && value !== initialValue) {
                    onSave(value);
                  }
                  setIsEditing(false);
                } else {
                  setIsEditing(true);
                }
              }}
            >
              {isEditing ? <Check size={12} color="green" /> : <Edit size={12} />}
            </button>
            {isEditing && (
              <button
                className="btn-edit-inline"
                onClick={() => {
                  setValue(initialValue);
                  setIsEditing(false);
                }}
              >
                <X size={12} color="red" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const UserAutoSuggestField = ({ label, initialValue, onSave, users = [] }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [searchTerm, setSearchTerm] = useState('');
  
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const filteredUsers = users.filter(u => 
    (u.username && u.username.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.firstName && u.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.name && u.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="editable-field" style={{ position: 'relative' }}>
      <label>{label}</label>
      <div className="field-content">
        {isEditing ? (
          <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type username to search..."
              autoFocus
              style={{ flex: 1, padding: '4px', border: '1px dashed #8c6cf5', borderRadius: '4px' }}
            />
            {searchTerm && (
              <div className="custom-dropdown-list" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, maxHeight: '150px', overflowY: 'auto', background: '#fff', border: '1px solid #ddd', borderRadius: '4px' }}>
                {filteredUsers.length > 0 ? filteredUsers.map(u => {
                  const displayName = u.username || u.firstName || u.name || 'User';
                  const fullLabel = `${displayName}${u.firstName ? ' (' + u.firstName + ' ' + (u.lastName || '') + ')' : ''}`;
                  return (
                    <div
                      key={u.id}
                      className="custom-dropdown-item"
                      onClick={() => {
                        const selectedUsername = u.username || u.id;
                        setValue(selectedUsername);
                        setSearchTerm('');
                        setIsEditing(false);
                        if (onSave && selectedUsername !== initialValue) {
                          onSave(selectedUsername);
                        }
                      }}
                    >
                      {fullLabel}
                    </div>
                  );
                }) : (
                  <div className="custom-dropdown-item" style={{ color: '#888' }}>No users found</div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="value-display">{value || '---'}</div>
        )}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {!isEditing && (
            <button
              className="btn-edit-inline"
              onClick={() => {
                setSearchTerm('');
                setIsEditing(true);
              }}
            >
              <Edit size={12} />
            </button>
          )}
          {isEditing && (
            <button
              className="btn-edit-inline"
              onClick={() => {
                setSearchTerm('');
                setIsEditing(false);
              }}
            >
              <X size={12} color="red" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const FormBoxField = ({ label, value, isTextarea = false, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleSave = () => {
    if (isEditing) {
      if (onSave && localValue !== value) {
        onSave(localValue);
      }
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
  };

  return (
    <div className="form-box-field" style={{ display: 'flex', gap: '15px', alignItems: 'flex-start', marginBottom: '15px' }}>
      <label style={{ flex: '0 0 160px', fontSize: '12px', color: '#555', fontWeight: '600', paddingTop: isTextarea ? '8px' : '0', alignSelf: isTextarea ? 'flex-start' : 'center' }}>
        {label}
      </label>
      <div style={{ flex: '1', display: 'flex', gap: '10px' }}>
        {isTextarea ? (
          <textarea
            readOnly={!isEditing}
            value={localValue || ''}
            onChange={(e) => setLocalValue(e.target.value)}
            style={{ flex: 1, minHeight: '80px', border: isEditing ? '1px dashed #8c6cf5' : '1px dashed #ccc', borderRadius: '4px', padding: '8px 12px', resize: 'vertical', background: '#fdfdfd', color: '#555', fontSize: '13px' }}
          />
        ) : (
          <input
            type="text"
            readOnly={!isEditing}
            value={localValue || ''}
            onChange={(e) => setLocalValue(e.target.value)}
            style={{ flex: 1, height: '36px', border: isEditing ? '1px dashed #8c6cf5' : '1px dashed #ccc', borderRadius: '4px', padding: '0 12px', background: '#fdfdfd', color: '#555', fontSize: '13px' }}
          />
        )}
        {isEditing ? (
          <>
            <button onClick={handleSave} style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', flexShrink: 0 }}>
              <Check size={14} color="green" />
            </button>
            <button onClick={() => { setLocalValue(value); setIsEditing(false); }} style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', flexShrink: 0 }}>
              <X size={14} color="red" />
            </button>
          </>
        ) : (
          <button onClick={() => setIsEditing(true)} style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', flexShrink: 0 }}>
            <Edit size={14} color="#666" />
          </button>
        )}
      </div>
    </div>
  );
};

const FormBoxDropdown = ({ label, initialValue, options, onSave, onChange, directSelect = false }) => {
  const [isEditing, setIsEditing] = useState(directSelect ? true : false);
  const [value, setValue] = useState(initialValue || '');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    setValue(initialValue || '');
  }, [initialValue]);

  const handleSave = () => {
    if (isEditing) {
      if (value !== initialValue) {
        onSave(value);
      }
      setIsEditing(false);
      setDropdownOpen(false);
    } else {
      setIsEditing(true);
    }
  };

  const handleSelect = (opt) => {
    setValue(opt);
    setDropdownOpen(false);
    if (directSelect) {
      onSave(opt);
    }
    if (onChange) onChange(opt);
  };

  return (
    <div className="form-box-field" style={{ display: 'flex', gap: '15px', alignItems: 'flex-start', marginBottom: '15px' }}>
      <label style={{ flex: '0 0 160px', fontSize: '12px', color: '#555', fontWeight: '600', alignSelf: 'center' }}>
        {label}
      </label>
      <div style={{ flex: '1', display: 'flex', gap: '10px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <div
            onClick={() => (directSelect || isEditing) && setDropdownOpen(!dropdownOpen)}
            style={{ height: '36px', border: (directSelect || isEditing) ? '1px dashed #8c6cf5' : '1px dashed #ccc', borderRadius: '4px', padding: '0 12px', background: '#fdfdfd', color: '#555', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: (directSelect || isEditing) ? 'pointer' : 'default' }}
          >
            <span>{value || 'Select'}</span>
            {(directSelect || isEditing) && <ChevronDown size={14} style={{ color: '#888' }} />}
          </div>
          {dropdownOpen && (directSelect || isEditing) && (
            <div className="custom-dropdown-list" style={{ position: 'absolute', top: '100%', left: 0, width: '100%', zIndex: 10 }}>
              {options.map(opt => (
                <div
                  key={opt}
                  className={`custom-dropdown-item ${value === opt ? 'selected' : ''}`}
                  onClick={() => handleSelect(opt)}
                >
                  {opt}
                </div>
              ))}
            </div>
          )}
        </div>
        {!directSelect && (
          isEditing ? (
            <>
              <button
                onClick={handleSave}
                style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', flexShrink: 0 }}
              >
                <Check size={14} color="green" />
              </button>
              <button
                onClick={() => {
                  setValue(initialValue || '');
                  setIsEditing(false);
                  setDropdownOpen(false);
                }}
                style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', flexShrink: 0 }}
              >
                <X size={14} color="red" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', flexShrink: 0 }}
            >
              <Edit size={14} color="#666" />
            </button>
          )
        )}
      </div>
    </div>
  );
};

export default function LeadProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Source Information');
  const [activeLogTab, setActiveLogTab] = useState('Lead Log');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState({ visible: false, type: '', message: '' });
  const [leadStatusOptions, setLeadStatusOptions] = useState([]);

  const showToast = (type, message) => {
    setToast({ visible: true, type, message });
    setTimeout(() => setToast({ visible: false, type: '', message: '' }), 5000);
  };

  const [savedRating, setSavedRating] = useState('warm');
  const [selectedRating, setSelectedRating] = useState('warm');
  const [lead, setLead] = useState(null);
  const [logs, setLogs] = useState([]);
  const [usersList, setUsersList] = useState([]);

  const [isStatusEditing, setIsStatusEditing] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [attemptedModalOpen, setAttemptedModalOpen] = useState(false);
  const [rejectedModalOpen, setRejectedModalOpen] = useState(false);
  const [siteVisitModalOpen, setSiteVisitModalOpen] = useState(false);
  const [interestedModalOpen, setInterestedModalOpen] = useState(false);
  const [rejectedModalSource, setRejectedModalSource] = useState(null);

  const [enquiryStatus, setEnquiryStatus] = useState('New Lead');

  const [attemptedFormData, setAttemptedFormData] = useState({
    openReason: '',
    callStatus: '',
    followUpDate: '',
    callRemarks: ''
  });

  const [rejectedFormData, setRejectedFormData] = useState({
    rejectedReason: ''
  });

  const [siteVisitFormData, setSiteVisitFormData] = useState({
    siteVisitDate: '',
    siteVisitNote: ''
  });

  const [interestedFormData, setInterestedFormData] = useState({
    followUpDate: '',
    callRemarks: ''
  });

  const [allocateModalOpen, setAllocateModalOpen] = useState(false);
  const [allocateFormData, setAllocateFormData] = useState({
    allocateTo: '',
    targetDate: '',
    allocationNotes: ''
  });

  const [reScheduledModalOpen, setReScheduledModalOpen] = useState(false);
  const [confirmedModalOpen, setConfirmedModalOpen] = useState(false);
  const [doneModalOpen, setDoneModalOpen] = useState(false);
  const [opportunityModalOpen, setOpportunityModalOpen] = useState(false);

  const [reScheduledFormData, setReScheduledFormData] = useState({
    siteVisitDate: '',
    siteVisitNote: ''
  });

  const [confirmedFormData, setConfirmedFormData] = useState({
    siteVisitConfirmedDate: '',
    siteVisitConfirmedNote: '',
    leadOwner: ''
  });

  const [doneFormData, setDoneFormData] = useState({
    siteVisitDoneDate: '',
    siteVisitDoneNote: ''
  });

  const [opportunityFormData, setOpportunityFormData] = useState({
    bookingStatus: ''
  });

  useEffect(() => {
    fetchLead();
    fetchUsers();
    fetchLeadStatuses();
  }, [id]);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsersList(data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchLeadStatuses = async () => {
    try {
      const response = await fetch('/api/lead-statuses');
      if (response.ok) {
        const data = await response.json();
        setLeadStatusOptions(Array.isArray(data) ? data.map(s => s.statusName) : []);
      }
    } catch (error) {
      console.error('Failed to fetch lead statuses:', error);
    }
  };

  const fetchLead = async () => {
    try {
      const response = await fetch(`/api/leads/${id}`);
      if (response.ok) {
        const data = await response.json();
        setLead(data);
        setEnquiryStatus(data.status || 'New Lead');
        setSavedRating(data.rating || 'warm');
        setSelectedRating(data.rating || 'warm');
        setLogs(data.logs || []);
        if (data.status === 'Site Visit') {
          setActiveTab('Site Visit Details');
        }
      }
    } catch (error) {
      console.error('Failed to fetch lead:', error);
    }
  };

  const handleFieldSave = async (field, value) => {
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      });
      if (response.ok) {
        fetchLead(); // refresh data
      }
    } catch (error) {
      console.error(`Failed to update ${field}:`, error);
    }
  };

  const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60000;
    return (new Date(date.getTime() - offset)).toISOString().slice(0, 16);
  };

  if (!lead) return <div>Loading...</div>;

  const leadName = lead.name || 'Lead User';

  const formatCurrentDate = () => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = String(hours).padStart(2, '0');

    return `on ${day}-${month}-${year} ${strHours}:${minutes}:${seconds} ${ampm}`;
  };

  const handleUpdateRating = () => {
    if (savedRating === selectedRating) return;

    const newLog = {
      id: Date.now(),
      title: 'Rating Changed',
      subtitle: `from ${savedRating} to ${selectedRating} by admin`,
      date: formatCurrentDate()
    };
    setLogs([newLog, ...logs]);
    setSavedRating(selectedRating);
  };

  const handleStatusChangeSubmit = async (statusOverride, customLogEntry = null) => {
    const finalStatus = statusOverride || enquiryStatus;
    const bodyData = { status: finalStatus };
    if (customLogEntry) bodyData.logEntry = customLogEntry;

    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });
      if (response.ok) {
        fetchLead();
        setStatusDropdownOpen(false);
        setIsStatusEditing(false);
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleStatusSelect = (status) => {
    setEnquiryStatus(status);
    if (status === 'Attempted') {
      setAttemptedModalOpen(true);
      setStatusDropdownOpen(false);
    } else if (status === 'Rejected') {
      setRejectedModalSource('Enquiry');
      setRejectedModalOpen(true);
      setStatusDropdownOpen(false);
    } else if (status === 'Site Visit') {
      setSiteVisitModalOpen(true);
      setStatusDropdownOpen(false);
    } else if (status === 'Interested') {
      setInterestedModalOpen(true);
      setStatusDropdownOpen(false);
    } else if (status === 'Allocate') {
      setAllocateModalOpen(true);
      setStatusDropdownOpen(false);
    }
  };

  const handleAttemptedSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 3000));
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Attempted',
          ...attemptedFormData,
          logEntry: {
            title: 'Lead Enquiry Status Updated',
            subtitle: 'by admin as Attempted'
          }
        })
      });
      if (response.ok) {
        setAttemptedModalOpen(false);
        setIsStatusEditing(false);
        fetchLead();
        showToast('success', 'Lead status is updated as Attempted successfully');
      }
    } catch (error) {
      console.error('Failed to save Attempted status:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectedSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 3000));
    try {
      const payload = rejectedModalSource === 'SiteVisit' 
        ? {
            siteVisitStatus: 'Rejected',
            reasonDetails: rejectedFormData.rejectedReason,
            logEntry: {
              title: 'Site Visit Status Updated',
              subtitle: `by admin as Rejected - ${rejectedFormData.rejectedReason}`
            }
          }
        : {
            status: 'Rejected',
            reasonDetails: rejectedFormData.rejectedReason,
            logEntry: {
              title: 'Lead Enquiry Status Updated',
              subtitle: `by admin as Rejected - ${rejectedFormData.rejectedReason}`
            }
          };

      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        setRejectedModalOpen(false);
        setIsStatusEditing(false);
        fetchLead();
        const toastMsg = rejectedModalSource === 'SiteVisit'
          ? 'Site visit status is rejected successfully'
          : 'Lead status is updated as Rejected successfully';
        showToast('success', toastMsg);
      }
    } catch (error) {
      console.error('Failed to save Rejected status:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSiteVisitSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 3000));
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Site Visit',
          siteVisitDate: siteVisitFormData.siteVisitDate,
          siteVisitNote: siteVisitFormData.siteVisitNote,
          logEntry: {
            title: 'Lead Enquiry Status Updated',
            subtitle: `by admin as Site Visit Scheduled`
          }
        })
      });
      if (response.ok) {
        setSiteVisitModalOpen(false);
        setIsStatusEditing(false);
        setActiveTab('Site Visit Details');
        fetchLead();
        showToast('success', 'Site visit status updated to Site Visit Scheduled successfully');
      }
    } catch (error) {
      console.error('Failed to save Site Visit status:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenericSubmit = async (field, value) => {
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [field]: value,
          logEntry: {
            title: 'Lead Updated',
            subtitle: `by admin updated ${field} to ${value}`
          }
        })
      });
      if (response.ok) {
        fetchLead();
      }
    } catch (error) {
      console.error(`Failed to save ${field}:`, error);
    }
  };

  const handleInterestedSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 3000));
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Interested',
          followUpDate: interestedFormData.followUpDate,
          callRemarks: interestedFormData.callRemarks,
          logEntry: {
            title: 'Lead Enquiry Status Updated',
            subtitle: `by admin as Interested`
          }
        })
      });
      if (response.ok) {
        setInterestedModalOpen(false);
        setIsStatusEditing(false);
        fetchLead();
        showToast('success', 'Lead status is updated as Interested successfully');
      }
    } catch (error) {
      console.error('Failed to save Interested status:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReScheduledSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteVisitStatus: 'Re Scheduled Visit',
          siteVisitDate: reScheduledFormData.siteVisitDate,
          siteVisitNote: reScheduledFormData.siteVisitNote,
          logEntry: {
            title: 'Site Visit Status Updated',
            subtitle: `by admin as Re Scheduled Visit`
          }
        })
      });
      if (response.ok) {
        setReScheduledModalOpen(false);
        fetchLead();
        showToast('success', 'Site visit status updated to Re Scheduled Visit successfully');
      }
    } catch (error) {
      console.error('Failed to save Re Scheduled Visit status:', error);
    }
  };

  const handleConfirmedSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteVisitStatus: 'Site Visit Confirmed',
          siteVisitConfirmedDate: confirmedFormData.siteVisitConfirmedDate,
          siteVisitConfirmedNote: confirmedFormData.siteVisitConfirmedNote,
          owner: confirmedFormData.leadOwner,
          logEntry: {
            title: 'Site Visit Status Updated',
            subtitle: `by admin as Site Visit Confirmed`
          }
        })
      });
      if (response.ok) {
        setConfirmedModalOpen(false);
        fetchLead();
        showToast('success', 'Site visit status updated to Site Visit Confirmed successfully');
      }
    } catch (error) {
      console.error('Failed to save Confirmed status:', error);
    }
  };

  const handleDoneSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteVisitStatus: 'Site Visit Done',
          siteVisitDoneDate: doneFormData.siteVisitDoneDate,
          siteVisitDoneNote: doneFormData.siteVisitDoneNote,
          logEntry: {
            title: 'Site Visit Status Updated',
            subtitle: `by admin as Site Visit Done`
          }
        })
      });
      if (response.ok) {
        setDoneModalOpen(false);
        fetchLead();
        showToast('success', 'Site visit status updated to Site Visit Done successfully');
      }
    } catch (error) {
      console.error('Failed to save Done status:', error);
    }
  };

  const handleAllocateSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 3000));
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Allocate',
          owner: allocateFormData.allocateTo,
          followUpDate: allocateFormData.targetDate || undefined,
          additionalRemarks: allocateFormData.allocationNotes || undefined,
          logEntry: {
            title: 'Lead Allocated',
            subtitle: `by admin allocated to ${allocateFormData.allocateTo}`
          }
        })
      });
      if (response.ok) {
        setAllocateModalOpen(false);
        setIsStatusEditing(false);
        setEnquiryStatus(lead?.status || 'New Lead');
        fetchLead();
        showToast('success', `Lead allocated to ${allocateFormData.allocateTo} successfully`);
      }
    } catch (error) {
      console.error('Failed to allocate lead:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpportunitySubmit = async (e) => {
    e.preventDefault();
    try {
      // 1. Create the Opportunity record
      const oppResponse = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: id,
          opportunityOwner: lead.owner || 'admin',
          stage: opportunityFormData.bookingStatus || 'Opportunity'
        })
      });

      if (!oppResponse.ok) {
        console.error('Failed to create opportunity record');
      }

      // 2. Update Lead Status
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Opportunity',
          siteVisitStatus: 'Opportunity',
          bookingStatus: opportunityFormData.bookingStatus,
          logEntry: {
            title: 'Lead Converted to Opportunity',
            subtitle: `by admin with booking status: ${opportunityFormData.bookingStatus}`
          }
        })
      });
      if (response.ok) {
        setOpportunityModalOpen(false);
        fetchLead();
        navigate('/opportunities');
      }
    } catch (error) {
      console.error('Failed to save Opportunity status:', error);
    }
  };

  return (
    <div className="lead-profile-page">
      <div className="profile-header">
        <div className="page-breadcrumb">
          <Home size={14} style={{ cursor: 'pointer' }} onClick={() => navigate('/')} />
          <span className="slash">/</span>
          <span className="current" onClick={() => navigate('/leads')} style={{ cursor: 'pointer', color: '#8c6cf5', fontWeight: '500' }}>Lead Profile - {leadName}</span>
        </div>
      </div>



      <div className="profile-content-wrapper">
        <div className="profile-main">

          <div className="info-section top-info">
            <div className="info-column">
              <h3>General Info</h3>
              <EditableField label="Enquiry Id :" initialValue={lead.id.startsWith('ENQ') ? lead.id : `ENQ_${lead.id}`} readOnly={true} />
              <EditableField label="EUID :" initialValue="469" readOnly={true} />
              <EditableField label="Project Name :" initialValue={lead.project || ''} onSave={(v) => handleGenericSubmit('project', v)} />
              <EditableField label="Enquiry Name :" initialValue={leadName} onSave={(v) => handleGenericSubmit('name', v)} />
              <EditableField label="Country Code :" initialValue="91" numericOnly={true} />
              <EditableField label="Mobile Number :" initialValue={lead.mobile} onSave={(v) => handleGenericSubmit('mobile', v)} numericOnly={true} />
              <EditableField label="Email :" initialValue={lead.email} onSave={(v) => handleGenericSubmit('email', v)} />
              <EditableField label="Enquiry Project :" initialValue={lead.project || ''} onSave={(v) => handleGenericSubmit('project', v)} />
              <EditableField label="Alternate No. :" initialValue="" />
              <EditableField label="Alternate Email :" initialValue="" />
              <EditableField label="Occupation :" initialValue="" />
              <EditableField label="Company Name :" initialValue="" />
              <EditableField label="Virtual Visit :" initialValue="" />

              {lead.status !== 'New Lead' && (
                <>
                  <div className="divider-line"></div>
                  <EditableField label="Open Reason :" initialValue={lead.openReason || ''} onSave={(v) => handleGenericSubmit('openReason', v)} />
                  <EditableField label="Call Status :" initialValue={lead.callStatus || ''} onSave={(v) => handleGenericSubmit('callStatus', v)} />
                  <EditableField label="Call Remarks :" initialValue={lead.callRemarks || ''} onSave={(v) => handleGenericSubmit('callRemarks', v)} />
                </>
              )}
            </div>

            <div className="info-column">
              <h3>Lead Info</h3>
              <div className="editable-field">
                <label>Rating :</label>
                <div className="rating-radios">
                  <label className="radio-label hot">
                    <input type="radio" name="rating" checked={selectedRating === 'hot'} onChange={() => setSelectedRating('hot')} /> Hot
                  </label>
                  <label className="radio-label warm">
                    <input type="radio" name="rating" checked={selectedRating === 'warm'} onChange={() => setSelectedRating('warm')} /> Warm
                  </label>
                  <label className="radio-label cold">
                    <input type="radio" name="rating" checked={selectedRating === 'cold'} onChange={() => setSelectedRating('cold')} /> Cold
                  </label>
                  <button className="btn-update-rating" onClick={handleUpdateRating}>
                    <RefreshCcw size={14} />
                  </button>
                </div>
              </div>
              <EditableField label="Allocator :" initialValue="admin" readOnly={true} />
              <UserAutoSuggestField label="Lead Owner :" initialValue={lead.owner} onSave={(v) => handleGenericSubmit('owner', v)} users={usersList} />

              <div className="editable-field">
                <label>Enquiry Status :</label>
                <div className="field-content custom-dropdown-container">
                  {!isStatusEditing ? (
                    <div className="value-display">{lead?.status || 'New Lead'}</div>
                  ) : (
                    <>
                      <div
                        className={`custom-dropdown-header ${statusDropdownOpen ? 'open' : ''}`}
                        onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        {enquiryStatus}
                        <ChevronDown size={14} style={{ color: '#888' }} />
                      </div>
                      {statusDropdownOpen && (
                        <div className="custom-dropdown-list">
                          {leadStatusOptions.length > 0 ? leadStatusOptions.map(s => (
                            <div
                              key={s}
                              className={`custom-dropdown-item ${enquiryStatus === s ? 'selected' : ''}`}
                              onClick={() => handleStatusSelect(s)}
                            >
                              {s}
                            </div>
                          )) : null}
                        </div>
                      )}
                    </>
                  )}
                  {(localStorage.getItem('loggedInUser') === 'admin' || lead?.status !== 'Site Visit') && (
                    <button
                      className="btn-edit-inline"
                      onClick={() => {
                        if (isStatusEditing) {
                          handleStatusChangeSubmit();
                        } else {
                          setEnquiryStatus(lead?.status || 'New Lead');
                          setIsStatusEditing(true);
                        }
                      }}
                    >
                      {isStatusEditing ? <RefreshCcw size={12} /> : <Edit size={12} />}
                    </button>
                  )}
                </div>
              </div>

              <EditableField
                label="Follow Up Date :"
                initialValue={formatDateForInput(lead.followUpDate)}
                inputType="datetime-local"
                onSave={(v) => handleGenericSubmit('followUpDate', v)}
              />
              <EditableField label="Allocated Date :" initialValue="" inputType="datetime-local" />
              <EditableField label="Virtual Visit Date :" initialValue="" inputType="datetime-local" />

              {lead.status !== 'New Lead' && (
                <>
                  <div className="divider-line"></div>
                  <EditableField label="Rejected Reason :" initialValue={lead.reasonDetails || ''} onSave={(v) => handleGenericSubmit('reasonDetails', v)} />
                  <EditableField label="Rejected Reason Subtype:" initialValue={lead.rejectionType || ''} onSave={(v) => handleGenericSubmit('rejectionType', v)} />
                  <EditableField label="Stage :" initialValue="" />
                  <EditableField label="Allocated To :" initialValue="" />
                </>
              )}
            </div>
          </div>

          <div className="bottom-tabs">
            <button className={`bottom-tab ${activeTab === 'Source Information' ? 'active' : ''}`} onClick={() => setActiveTab('Source Information')}>
              Source Information
            </button>
            {lead.status !== 'New Lead' && (
              <button className={`bottom-tab ${activeTab === 'Site Visit Details' ? 'active' : ''}`} onClick={() => setActiveTab('Site Visit Details')}>
                Site Visit Details
              </button>
            )}
          </div>

          {activeTab === 'Source Information' && (
            <div className="info-section bottom-info">
              <div className="info-column" style={{ gap: '5px' }}>
                <FormBoxDropdown
                  label="Primary Source :"
                  initialValue={lead.primarySource || ''}
                  options={['Digital Marketing', 'Outdoor Marketing', 'Direct Walk In', 'Channel Partner']}
                  onSave={(val) => handleGenericSubmit('primarySource', val)}
                />
                <FormBoxDropdown
                  label="Secondary Source :"
                  initialValue={lead.secondarySource || ''}
                  options={['Website', 'Event', 'Social Media']}
                  onSave={(val) => handleGenericSubmit('secondarySource', val)}
                />
                <FormBoxDropdown
                  label="Tertiary Source :"
                  initialValue={lead.tertiarySource || ''}
                  options={['Landing Page', 'Event Form', 'FB Link', 'Affiliate Link', 'FB Ads']}
                  onSave={(val) => handleGenericSubmit('tertiarySource', val)}
                />
                <FormBoxField label="Preffered Budget :" value="" />
                <FormBoxField label="Preffered Locality :" value="" />
              </div>
              <div className="info-column" style={{ gap: '5px' }}>
                <FormBoxField label="Channel Partner Name :" value="" />
                <FormBoxField label="Channel Partner ID :" value="" />
                <FormBoxField label="Referrer Details :" value="" />
                <FormBoxField label="Source Url :" value="" />
                <FormBoxField label="Earlier Source :" value="" />
              </div>
            </div>
          )}

          {activeTab === 'Site Visit Details' && lead.status !== 'New Lead' && (
            <div className="info-section bottom-info">
              <div className="info-column" style={{ gap: '5px' }}>
                <FormBoxDropdown
                  label="Site Visit Status :"
                  initialValue={lead.siteVisitStatus || (lead.siteVisitDate ? "Site Visit Scheduled" : "")}
                  options={['Site Visit Scheduled', 'Re Scheduled Visit', 'Site Visit Confirmed', 'Site Visit Done', 'Opportunity', 'Rejected']}
                  directSelect={true}
                  onSave={(val) => {
                    // Only do generic save if it's not one of the modal triggers
                    if (!['Re Scheduled Visit', 'Site Visit Confirmed', 'Site Visit Done', 'Opportunity', 'Rejected'].includes(val)) {
                      handleGenericSubmit('siteVisitStatus', val);
                    }
                  }}
                  onChange={(val) => {
                    if (val === 'Re Scheduled Visit') {
                      setReScheduledModalOpen(true);
                    } else if (val === 'Site Visit Confirmed') {
                      setConfirmedFormData(prev => ({ ...prev, leadOwner: lead?.owner || '' }));
                      setConfirmedModalOpen(true);
                    } else if (val === 'Site Visit Done') {
                      setDoneModalOpen(true);
                    } else if (val === 'Opportunity') {
                      setOpportunityModalOpen(true);
                    } else if (val === 'Rejected') {
                      setRejectedModalSource('SiteVisit');
                      setRejectedModalOpen(true);
                    }
                  }}
                />
                <FormBoxField
                  label="Site Visit Scheduled Date :"
                  value={lead.siteVisitDate ? new Date(lead.siteVisitDate).toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  }).replace(',', '') : 'dd-mm-yyyy --:-- --'}
                />
                <FormBoxField label="Site Visit Scheduled Note :" value={lead.siteVisitNote || ""} isTextarea={true} />
                <FormBoxField
                  label="Site Visit Confirmed Date :"
                  value={lead.siteVisitConfirmedDate ? new Date(lead.siteVisitConfirmedDate).toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  }).replace(',', '') : 'dd-mm-yyyy --:-- --'}
                />
                <FormBoxField label="Site Visit Confirmed Note :" value={lead.siteVisitConfirmedNote || ""} isTextarea={true} />
              </div>
              <div className="info-column" style={{ gap: '5px' }}>
                <FormBoxField
                  label="Site Visit Done Date :"
                  value={lead.siteVisitDoneDate ? new Date(lead.siteVisitDoneDate).toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  }).replace(',', '') : 'dd-mm-yyyy --:-- --'}
                />
                <FormBoxField label="Site Visit Done Note :" value={lead.siteVisitDoneNote || ""} isTextarea={true} />
                <FormBoxField label="Number of Site Visit :" value="" />
                <FormBoxField label="Time of 1st Visit :" value="" />
                <FormBoxField label="Time of 2st Visit :" value="" />
              </div>
            </div>
          )}
        </div>

        <div className="profile-sidebar">
          <div className="sidebar-tabs">
            <button className={`sidebar-tab ${activeLogTab === 'Lead Log' ? 'active' : ''}`} onClick={() => setActiveLogTab('Lead Log')}>Lead Log</button>
            <button className={`sidebar-tab ${activeLogTab === 'Call History' ? 'active' : ''}`} onClick={() => setActiveLogTab('Call History')}>Call History</button>
          </div>

          {activeLogTab === 'Lead Log' && (
            <div className="log-list">
              {(() => {
                const sortedLogs = [...logs].sort((a, b) => {
                  const parseDate = (d) => {
                    if (!d) return 0;
                    let str = String(d);
                    if (str.startsWith('on ')) {
                      str = str.substring(3);
                    }
                    const formatted = str.replace(/-/g, ' ');
                    const parsed = Date.parse(formatted);
                    return isNaN(parsed) ? new Date(d).getTime() : parsed;
                  };
                  return parseDate(b.date) - parseDate(a.date);
                });
                return sortedLogs.map((log, idx) => (
                  <div className="log-item" key={log.id || idx}>
                    <div className="log-avatar-img">
                      <img src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${log.title}&backgroundColor=f0ecfc`} alt="avatar" />
                    </div>
                    <div className="log-content">
                      <p>{log.title}</p>
                      <span>{log.subtitle}</span>
                      <span className="log-date">
                        on {String(log.date).startsWith('on ') ? String(log.date).substring(3) : new Date(log.date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </div>
                  </div>
                ));
              })()}
              {logs.length === 0 && (
                <div className="log-item" style={{ color: '#888' }}>No logs available.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {attemptedModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content attempted-modal">
            <div className="modal-header">
              <h3>Attempted</h3>
              <button className="btn-close" onClick={() => {
                setAttemptedModalOpen(false);
                setEnquiryStatus(lead?.status || 'New Lead');
                setIsStatusEditing(false);
              }}>&times;</button>
            </div>
            <form onSubmit={handleAttemptedSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Open Reason:</label>
                  <select
                    className="modal-select"
                    value={attemptedFormData.openReason}
                    onChange={(e) => setAttemptedFormData({ ...attemptedFormData, openReason: e.target.value })}
                    required
                  >
                    <option value="">Select Open Reason</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Shared Details">Shared Details</option>
                    <option value="Retry">Retry</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Call Status :</label>
                  <select
                    className="modal-select"
                    value={attemptedFormData.callStatus}
                    onChange={(e) => setAttemptedFormData({ ...attemptedFormData, callStatus: e.target.value })}
                    required
                  >
                    <option value="">Select Call Status</option>
                    <option value="RNR">RNR</option>
                    <option value="Call Connected">Call Connected</option>
                    <option value="Number Busy">Number Busy</option>
                    <option value="Not Reachable">Not Reachable</option>
                    <option value="Switched Off">Switched Off</option>
                    <option value="Number Not In Use">Number Not In Use</option>
                    <option value="Wrong Number">Wrong Number</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Follow Up Date :</label>
                  <input
                    type="datetime-local"
                    className="modal-input"
                    value={attemptedFormData.followUpDate}
                    onChange={(e) => setAttemptedFormData({ ...attemptedFormData, followUpDate: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Call Remarks</label>
                  <textarea
                    className="modal-input form-textarea"
                    placeholder="Call Remarks"
                    value={attemptedFormData.callRemarks}
                    onChange={(e) => setAttemptedFormData({ ...attemptedFormData, callRemarks: e.target.value })}
                    required
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn-submit-modal" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {rejectedModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content attempted-modal">
            <div className="modal-header">
              <h3>Rejected Reason</h3>
              <button className="btn-close" onClick={() => {
                setRejectedModalOpen(false);
                setEnquiryStatus(lead?.status || 'New Lead');
                setIsStatusEditing(false);
              }}>&times;</button>
            </div>
            <form onSubmit={handleRejectedSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: '#555', fontSize: '13px' }}>Rejected Reason :</label>
                  <textarea
                    className="modal-input form-textarea"
                    placeholder="Reject Reason"
                    style={{ borderStyle: 'dashed' }}
                    value={rejectedFormData.rejectedReason}
                    onChange={(e) => setRejectedFormData({ rejectedReason: e.target.value })}
                    required
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer" style={{ paddingRight: '20px', paddingBottom: '20px' }}>
                <button type="submit" className="btn-submit-modal" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {siteVisitModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content attempted-modal">
            <div className="modal-header">
              <h3>Converted To Site Visit</h3>
              <button className="btn-close" onClick={() => {
                setSiteVisitModalOpen(false);
                setEnquiryStatus(lead?.status || 'New Lead');
                setIsStatusEditing(false);
              }}>&times;</button>
            </div>
            <form onSubmit={handleSiteVisitSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: '#555', fontSize: '13px' }}>Site Visit Scheduled Date :</label>
                  <input
                    type="datetime-local"
                    className="modal-input"
                    style={{ borderStyle: 'dashed' }}
                    value={siteVisitFormData.siteVisitDate}
                    onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, siteVisitDate: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: '#555', fontSize: '13px' }}>Note</label>
                  <textarea
                    className="modal-input form-textarea"
                    placeholder="Note"
                    style={{ borderStyle: 'dashed' }}
                    value={siteVisitFormData.siteVisitNote}
                    onChange={(e) => setSiteVisitFormData({ ...siteVisitFormData, siteVisitNote: e.target.value })}
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer" style={{ paddingRight: '20px', paddingBottom: '20px' }}>
                <button type="submit" className="btn-submit-modal" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {interestedModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content attempted-modal">
            <div className="modal-header">
              <h3>Interested</h3>
              <button className="btn-close" onClick={() => {
                setInterestedModalOpen(false);
                setEnquiryStatus(lead?.status || 'New Lead');
                setIsStatusEditing(false);
              }}>&times;</button>
            </div>
            <form onSubmit={handleInterestedSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: '#555', fontSize: '13px' }}>Follow Up Date :</label>
                  <input
                    type="datetime-local"
                    className="modal-input"
                    style={{ borderStyle: 'dashed' }}
                    value={interestedFormData.followUpDate}
                    onChange={(e) => setInterestedFormData({ ...interestedFormData, followUpDate: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: '#555', fontSize: '13px' }}>Call Remarks</label>
                  <textarea
                    className="modal-input form-textarea"
                    placeholder="Call Remarks"
                    style={{ borderStyle: 'dashed' }}
                    value={interestedFormData.callRemarks}
                    onChange={(e) => setInterestedFormData({ ...interestedFormData, callRemarks: e.target.value })}
                    required
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer" style={{ paddingRight: '20px', paddingBottom: '20px' }}>
                <button type="submit" className="btn-submit-modal" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {allocateModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content attempted-modal">
            <div className="modal-header">
              <h3>Allocate Lead</h3>
              <button className="btn-close" onClick={() => {
                setAllocateModalOpen(false);
                setEnquiryStatus(lead?.status || 'New Lead');
                setIsStatusEditing(false);
              }}>&times;</button>
            </div>
            <form onSubmit={handleAllocateSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: '#555', fontSize: '13px' }}>Allocate To :</label>
                  <select
                    className="modal-input"
                    style={{ borderStyle: 'dashed' }}
                    value={allocateFormData.allocateTo}
                    onChange={(e) => setAllocateFormData({ ...allocateFormData, allocateTo: e.target.value })}
                    required
                  >
                    <option value="">Select User</option>
                    {usersList.map(u => (
                      <option key={u.id} value={u.username || u.id}>
                        {u.firstName && u.lastName ? `${u.firstName} ${u.lastName} (${u.username})` : (u.username || u.id)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: '#555', fontSize: '13px' }}>Target Date :</label>
                  <input
                    type="datetime-local"
                    className="modal-input"
                    style={{ borderStyle: 'dashed' }}
                    value={allocateFormData.targetDate}
                    onChange={(e) => setAllocateFormData({ ...allocateFormData, targetDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: '#555', fontSize: '13px' }}>Allocation Notes :</label>
                  <textarea
                    className="modal-input form-textarea"
                    placeholder="Allocation Notes"
                    style={{ borderStyle: 'dashed' }}
                    value={allocateFormData.allocationNotes}
                    onChange={(e) => setAllocateFormData({ ...allocateFormData, allocationNotes: e.target.value })}
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer" style={{ paddingRight: '20px', paddingBottom: '20px' }}>
                <button type="submit" className="btn-submit-modal" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reScheduledModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content attempted-modal">
            <div className="modal-header">
              <h3>Re Scheduled Site Visit</h3>
              <button className="btn-close" onClick={() => setReScheduledModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleReScheduledSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: '#555', fontSize: '13px' }}>Site Visit Scheduled Date :</label>
                  <input
                    type="datetime-local"
                    className="modal-input"
                    style={{ borderStyle: 'dashed' }}
                    value={reScheduledFormData.siteVisitDate}
                    onChange={(e) => setReScheduledFormData({ ...reScheduledFormData, siteVisitDate: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: '#555', fontSize: '13px' }}>Note</label>
                  <textarea
                    className="modal-input form-textarea"
                    placeholder="Note"
                    style={{ borderStyle: 'dashed' }}
                    value={reScheduledFormData.siteVisitNote}
                    onChange={(e) => setReScheduledFormData({ ...reScheduledFormData, siteVisitNote: e.target.value })}
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer" style={{ paddingRight: '20px', paddingBottom: '20px' }}>
                <button type="submit" className="btn-submit-modal">edit lead</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmedModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content attempted-modal">
            <div className="modal-header">
              <h3>Site Visit Confirmed</h3>
              <button className="btn-close" onClick={() => setConfirmedModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleConfirmedSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: '#555', fontSize: '13px' }}>Site Visit Confirm Date :</label>
                  <input
                    type="datetime-local"
                    className="modal-input"
                    style={{ borderStyle: 'dashed' }}
                    value={confirmedFormData.siteVisitConfirmedDate}
                    onChange={(e) => setConfirmedFormData({ ...confirmedFormData, siteVisitConfirmedDate: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: '#555', fontSize: '13px' }}>Note</label>
                  <textarea
                    className="modal-input form-textarea"
                    placeholder="Note"
                    style={{ borderStyle: 'dashed' }}
                    value={confirmedFormData.siteVisitConfirmedNote}
                    onChange={(e) => setConfirmedFormData({ ...confirmedFormData, siteVisitConfirmedNote: e.target.value })}
                  ></textarea>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: '#555', fontSize: '13px' }}>Lead Owner :</label>
                  <select
                    className="modal-input"
                    style={{ borderStyle: 'dashed' }}
                    value={confirmedFormData.leadOwner}
                    onChange={(e) => setConfirmedFormData({ ...confirmedFormData, leadOwner: e.target.value })}
                  >
                    <option value="">Select Owner</option>
                    {usersList.map(u => (
                      <option key={u.id} value={u.username || u.id}>
                        {u.username || u.id} - {u.firstName || u.name || 'User'} {u.lastName || ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer" style={{ paddingRight: '20px', paddingBottom: '20px' }}>
                <button type="submit" className="btn-submit-modal">Submit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {doneModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content attempted-modal">
            <div className="modal-header">
              <h3>Site Visit Done</h3>
              <button className="btn-close" onClick={() => setDoneModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleDoneSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: '#555', fontSize: '13px' }}>Site Visit Done Date :</label>
                  <input
                    type="datetime-local"
                    className="modal-input"
                    style={{ borderStyle: 'dashed' }}
                    value={doneFormData.siteVisitDoneDate}
                    onChange={(e) => setDoneFormData({ ...doneFormData, siteVisitDoneDate: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: '#555', fontSize: '13px' }}>Note</label>
                  <textarea
                    className="modal-input form-textarea"
                    placeholder="Note"
                    style={{ borderStyle: 'dashed' }}
                    value={doneFormData.siteVisitDoneNote}
                    onChange={(e) => setDoneFormData({ ...doneFormData, siteVisitDoneNote: e.target.value })}
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer" style={{ paddingRight: '20px', paddingBottom: '20px' }}>
                <button type="submit" className="btn-submit-modal">Submit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {opportunityModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content attempted-modal">
            <div className="modal-header">
              <h3>Are you sure, this lead will be converted to opportunity now?</h3>
              <button className="btn-close" onClick={() => setOpportunityModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleOpportunitySubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label
                    className="form-label"
                    style={{
                      marginBottom: "10px",
                      display: "block",
                      color: "#555",
                      fontSize: "13px",
                    }}
                  >
                    Booking Status :
                  </label>

                  <select
                    className="modal-select"
                    style={{ borderStyle: "dashed" }}
                    value={opportunityFormData.bookingStatus}
                    onChange={(e) =>
                      setOpportunityFormData({
                        ...opportunityFormData,
                        bookingStatus: e.target.value,
                      })
                    }
                    required
                  >
                    <option value="">Select Booking Status</option>
                    <option value="Initiate">Initiate</option>
                    <option value="Booking Done">Booking Done</option>
                  </select>
                </div>

                <input
                  type="hidden"
                  name="enquiryId"
                  value={opportunityFormData.enquiryId}
                  readOnly
                />
              </div>

              <div
                className="modal-footer"
                style={{ paddingRight: "20px", paddingBottom: "20px" }}
              >
                <button type="submit" className="btn-submit-modal">
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast.visible && (
        <div className={`leads-toast leads-toast-${toast.type}`}>
          <div className="leads-toast-icon">
            {toast.type === 'success' && <Check size={20} />}
            {toast.type === 'duplicate' && <AlertTriangle size={20} />}
            {toast.type === 'error' && <X size={20} />}
          </div>
          <span className="leads-toast-message">{toast.message}</span>
          <button className="leads-toast-close" onClick={() => setToast({ visible: false, type: '', message: '' })}>
            <X size={16} />
          </button>
        </div>
      )}

    </div>
  );
}
