import { useState, useEffect, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Home, Edit2, Trash2, X } from 'lucide-react';
import AdvancedTable from './components/AdvancedTable/AdvancedTable';
import './ProjectsList.css';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const CustomSelect = ({ label, options, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="form-group custom-select-container" ref={dropdownRef}>
      <label>{label}</label>
      <div
        className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{value || ''}</span>
      </div>
      {isOpen && (
        <div className="custom-select-dropdown">
          {options.map((option, index) => (
            <div
              key={index}
              className={`custom-select-option ${value === option ? 'selected' : ''}`}
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ProjectsList = () => {
  const navigate = useNavigate();
  const context = useOutletContext();
  const loggedInUser = localStorage.getItem('loggedInUser') || '';
  const pagePerm = context?.permissionsList?.find(p => p.page === 'projects');
  const hasExportPermission = loggedInUser === 'admin' ? true : (pagePerm ? !!pagePerm.export : true);

  const [projects, setProjects] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    projectName: '',
    projectLocation: '',
    projectType: 'Farm Land',
    projectStatus: 'Pre Launch'
  });

  const projectTypes = ['Farm Land', 'Apartment', 'villa'];
  const projectStatuses = ['Pre Launch', 'Launch', 'Under Construction', 'Ready to Move'];

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const sortedProjects = [...projects].sort((a, b) => {
    const aDate = new Date(a.updatedAt || a.createdAt).getTime();
    const bDate = new Date(b.updatedAt || b.createdAt).getTime();
    return bDate - aDate;
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsModalOpen(false);
        setFormData({
          projectName: '',
          projectLocation: '',
          projectType: 'Farm Land',
          projectStatus: 'Pre Launch'
        });
        fetchProjects();
      } else {
        const errorData = await response.json();
        alert(errorData.message || 'Failed to create project');
      }
    } catch (error) {
      console.error('Error creating project:', error);
      alert('An error occurred while creating the project.');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this project?')) {
      try {
        const response = await fetch(`/api/projects/${id}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          fetchProjects();
        }
      } catch (error) {
        console.error('Error deleting project:', error);
      }
    }
  };

  const exportCSV = () => {
    const headers = ["Sl", "Project Name", "Project Location", "Project Type", "Project Status"];
    const rows = sortedProjects.map((project, index) => [
      index + 1,
      project.projectName || "",
      project.projectLocation || "",
      project.projectType || "",
      project.projectStatus || ""
    ]);
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "projects.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Projects List", 14, 15);
    const tableColumn = ["Sl", "Project Name", "Project Location", "Project Type", "Project Status"];
    const tableRows = [];
    projects.forEach((project, index) => {
      tableRows.push([
        index + 1,
        project.projectName || "-",
        project.projectLocation || "-",
        project.projectType || "-",
        project.projectStatus || "-"
      ]);
    });
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });
    doc.save(`projects_${Date.now()}.pdf`);
  };

  const tableColumns = [
    { key: 'projectName', header: 'Project Name', sortable: true },
    { key: 'projectLocation', header: 'Project Location', sortable: true },
    { key: 'projectType', header: 'Project Type', sortable: true },
    { key: 'projectStatus', header: 'Project Status', sortable: true },
    {
      key: 'actions', header: 'Actions', sortable: false,
      renderCell: (row) => (
        <div className="actions-cell">
          <button
            className="btn-icon edit"
            title="Edit"
            onClick={() => navigate(`/projects/edit/${row.id}`)}
          >
            <Edit2 size={16} />
          </button>
          <button
            className="btn-icon delete"
            title="Delete"
            onClick={() => handleDelete(row.id)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="projects-page">
      <div className="projects-header-top">
        <div className="header-left">
          <h2>Projects</h2>
          <div className="page-breadcrumb">
            <Home size={14} style={{ cursor: 'pointer' }} onClick={() => navigate('/')} />
            <span className="slash">/</span>
            <span>Projects List</span>
          </div>
        </div>
        <button className="btn-create-project" onClick={() => setIsModalOpen(true)}>
          Create Projects
        </button>
      </div>

      <div className="projects-card">
        <div className="projects-card-header">
          <h3>Projects List</h3>
          <p>Projects - Create, view and edit Projects. Assign users to Projects.</p>
        </div>

        {hasExportPermission && (
          <div style={{ padding: '20px 20px 15px 20px', display: 'flex', gap: '8px' }}>
            <button
              onClick={exportCSV}
              style={{ padding: '6px 12px', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '13px', cursor: 'pointer', backgroundColor: '#7b68ee', transition: 'opacity 0.2s' }}
              onMouseEnter={(e) => e.target.style.opacity = '0.9'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              Export CSV
            </button>
            <button
              onClick={exportPDF}
              style={{ padding: '6px 12px', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '13px', cursor: 'pointer', backgroundColor: '#ef4444', transition: 'opacity 0.2s' }}
              onMouseEnter={(e) => e.target.style.opacity = '0.9'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              Export PDF
            </button>
          </div>
        )}

        <AdvancedTable
          columns={tableColumns}
          data={sortedProjects}
          sortConfig={{}}
          selectedIds={[]}
          onSelectAll={() => { }}
          onSelectRow={() => { }}
          currentPage={1}
          itemsPerPage={sortedProjects.length > 0 ? sortedProjects.length : 1}
          totalItems={sortedProjects.length}
          enableSelection={false}
        />
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content project-modal">
            <div className="modal-header">
              <h3>Create a New Projects</h3>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Project Name :</label>
                <input
                  type="text"
                  name="projectName"
                  placeholder="Project Name"
                  value={formData.projectName}
                  onChange={handleInputChange}
                />
              </div>

              <div className="form-group">
                <label>Project Location :</label>
                <input
                  type="text"
                  name="projectLocation"
                  placeholder="Project Location"
                  value={formData.projectLocation}
                  onChange={handleInputChange}
                />
              </div>

              <CustomSelect
                label="Project Type :"
                options={projectTypes}
                value={formData.projectType}
                onChange={(val) => setFormData(prev => ({ ...prev, projectType: val }))}
              />

              <CustomSelect
                label="Status :"
                options={projectStatuses}
                value={formData.projectStatus}
                onChange={(val) => setFormData(prev => ({ ...prev, projectStatus: val }))}
              />
            </div>

            <div className="modal-footer">
              <button className="btn-submit-project" onClick={handleSubmit}>
                Create Projects
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsList;
