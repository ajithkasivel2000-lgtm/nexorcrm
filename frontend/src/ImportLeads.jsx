import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Download } from 'lucide-react';
import './ImportLeads.css';

export default function ImportLeads() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [projectsList, setProjectsList] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [queueType, setQueueType] = useState('pre-sales');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          setProjectsList(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Error fetching projects:', err);
      }
    };
    fetchProjects();
  }, []);

  const handleDownloadSample = (e) => {
    e.preventDefault();
    
    // Build a project reference table from the fetched projects list
    let projectNote = '# --- Available Projects (project name, project id) ---\n';
    if (projectsList.length > 0) {
      projectsList.forEach(p => {
        projectNote += `# ${p.projectName}, ${p.id}\n`;
      });
    } else {
      // Fallback sample projects if list is empty
      projectNote += '# Vaighousing, PRJLST-2026-000001\n';
      projectNote += '# BCD Royale, PRJLST-2026-000002\n';
      projectNote += '# acres247, PRJLST-2026-000003\n';
      projectNote += '# Navileforms, PRJLST-2026-000004\n';
      projectNote += '# Codename Flow, PRJLST-2026-000005\n';
    }
    projectNote += '# ---\n';
    
    const dataRows = "enquiry name,phone number,email id,primary source,secondary source,tertiary source,project id\nSneha,9865321470,snehaa@gmail.com,channel partner,event,FB link,PRJLST-2026-000001\nRahul,9876543210,rahul@email.com,digital marketing,website,,";
    
    const csvContent = projectNote + dataRows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'sample_leads.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    } else {
      setFile(null);
    }
  };

  const parseCSV = (text) => {
    // Split lines, skip empty lines AND comment lines (starting with #)
    const lines = text.split(/\r\n|\n/).filter(line => {
      const trimmed = line.trim();
      return trimmed !== '' && !trimmed.startsWith('#');
    });
    if (lines.length <= 1) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const currentLine = lines[i];
      if (!currentLine.trim()) continue;

      const values = currentLine.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const rowObj = {};
      headers.forEach((h, index) => {
        rowObj[h] = values[index] || '';
      });
      rows.push(rowObj);
    }
    return rows;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file) {
      alert('Please select a CSV file to upload.');
      return;
    }

    setIsSubmitting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        const parsedRows = parseCSV(text);

        if (parsedRows.length === 0) {
          alert('No valid lead records found in the CSV file.');
          setIsSubmitting(false);
          return;
        }

        const response = await fetch('/api/leads/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queueType,
            projectId: selectedProjectId,
            leads: parsedRows
          })
        });

        if (response.ok) {
          const result = await response.json();
          alert(result.message || 'Leads imported successfully!');
          navigate('/leads');
        } else {
          const errData = await response.json();
          alert(errData.message || 'Failed to import leads.');
        }
      } catch (err) {
        console.error('CSV import error:', err);
        alert('An error occurred while parsing or uploading the CSV file.');
      } finally {
        setIsSubmitting(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="il-container">
      {/* Header */}
      <div className="il-header-block">
        <h1 className="il-title">Import Leads</h1>
        <div className="il-breadcrumbs">
          <Home className="il-home-icon" style={{ cursor: 'pointer' }} onClick={() => navigate('/')} />
          <span className="il-separator">/</span> Leads
          <span className="il-separator">/</span> <strong style={{ color: '#8c6cf5' }}>Import Leads</strong>
        </div>
      </div>

      <div className="il-grid">
        {/* Form Card */}
        <div className="il-form-card">
          <h2 className="il-card-title">Import Now</h2>
          <p className="il-card-subtitle">Import Leads - Leads can be imported from csv here</p>

          <form onSubmit={handleSubmit}>
            <div className="il-form-group">
              <label className="il-form-label">Queue Type:</label>
              <select className="il-form-control" value={queueType} onChange={(e) => setQueueType(e.target.value)} required>
                <option value="pre-sales">Pre Sales</option>
                <option value="sales">Sales</option>
                <option value="channel-partner">Channel Partner</option>
              </select>
            </div>

            <div className="il-form-group">
              <label className="il-form-label">Select File:</label>
              <div className="il-file-upload-container">
                <button type="button" className="il-file-btn">Choose File</button>
                <span className="il-file-name">{file ? file.name : 'No file chosen'}</span>
                <input
                  type="file"
                  className="il-file-input"
                  accept=".csv"
                  onChange={handleFileChange}
                  required
                />
              </div>
            </div>

            <div className="il-help-text">
              only csv files are accepted | Download A Sample File Here -&gt;
              <span className="il-download-link" onClick={handleDownloadSample}>
                <Download size={14} />
              </span>
            </div>

            <hr className="il-divider" />

            <button type="submit" className="il-submit-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Importing...' : 'Submit'}
            </button>
          </form>
        </div>

        {/* Help Card */}
        <div className="il-help-card">
          <h2 className="il-card-title">Need Help ?</h2>
          <ul className="il-help-list">
            <li className="il-help-item">
              <strong>Lead Import -</strong>This form is used for uploading the leads.
            </li>
            <li className="il-help-item">
              <strong>Select Project -</strong> Project To Be Selected while importing the lead .
            </li>
            <li className="il-help-item">
              <strong>Download Sample File -</strong> Download the sample file and add the values save as csv.
            </li>
            <li className="il-help-item">
              <strong>import lead -</strong> Import the csv file when all the fields of csv file is updated .
            </li>
            <li className="il-help-item">
              <strong>Project Names</strong> Select "lokations" as a project when you don't have any project to be assigned for the lead
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
