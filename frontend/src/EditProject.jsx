import { useState, useEffect, useRef } from 'react';
import { Home, Bold, Italic, Underline, Eraser, AlignLeft, AlignCenter, AlignRight, Type, List, Image as ImageIcon, Minus, HelpCircle } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import './EditProject.css';

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
    <div className="form-group row-layout custom-select-container" ref={dropdownRef}>
      <label className="field-label">{label}</label>
      <div className="field-input-wrapper">
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
    </div>
  );
};

const MockRichTextEditor = ({ label, name, value, onChange }) => {
  return (
    <div className="form-group row-layout rich-text-group">
      <label className="field-label">{label}</label>
      <div className="field-input-wrapper rich-text-wrapper">
        <div className="rich-text-toolbar">
          <button type="button" className="toolbar-btn"><Eraser size={14} /></button>
          <div className="toolbar-divider"></div>
          <button type="button" className="toolbar-btn font-bold"><Bold size={14} /></button>
          <button type="button" className="toolbar-btn font-italic"><Italic size={14} /></button>
          <button type="button" className="toolbar-btn font-underline"><Underline size={14} /></button>
          <button type="button" className="toolbar-btn"><Eraser size={14} /></button>
          <div className="toolbar-divider"></div>
          <button type="button" className="toolbar-btn text-highlight">
            <span style={{color: 'yellow', fontWeight: 'bold'}}>A</span> <span style={{fontSize: '10px'}}>▼</span>
          </button>
          <div className="toolbar-divider"></div>
          <button type="button" className="toolbar-btn"><AlignLeft size={14} /></button>
          <button type="button" className="toolbar-btn"><AlignCenter size={14} /></button>
          <button type="button" className="toolbar-btn"><AlignRight size={14} /></button>
          <div className="toolbar-divider"></div>
          <button type="button" className="toolbar-btn"><Type size={14} /> <span style={{fontSize: '10px'}}>▼</span></button>
          <div className="toolbar-divider"></div>
          <button type="button" className="toolbar-btn"><List size={14} /> <span style={{fontSize: '10px'}}>▼</span></button>
          <div className="toolbar-divider"></div>
          <button type="button" className="toolbar-btn"><span style={{fontWeight: 'bold', fontSize: '14px'}}>O</span></button>
          <button type="button" className="toolbar-btn"><ImageIcon size={14} /></button>
          <button type="button" className="toolbar-btn"><Minus size={14} /></button>
          <div className="toolbar-divider"></div>
          <button type="button" className="toolbar-btn"><HelpCircle size={14} /></button>
        </div>
        <textarea 
          name={name}
          value={value}
          onChange={onChange}
          className="rich-text-area"
        ></textarea>
      </div>
    </div>
  );
};

export default function EditProject() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    projectName: '',
    projectLocation: '',
    projectAmenities: '',
    features: '',
    mapLink: '',
    projectContact: '',
    projectEmail: '',
    projectType: 'Apartment',
    projectStatus: 'Pre Launch'
  });

  const projectTypes = ['Farm Land', 'Apartment', 'villa'];
  const projectStatuses = ['Pre Launch', 'Launch', 'Under Construction', 'Ready to Move'];

  useEffect(() => {
    fetchProject();
  }, [id]);

  const fetchProject = async () => {
    try {
      const response = await fetch(`/api/projects`);
      if (response.ok) {
        const data = await response.json();
        const project = data.find(p => p.id === id);
        if (project) {
          setFormData({
            projectName: project.projectName || '',
            projectLocation: project.projectLocation || '',
            projectAmenities: project.projectAmenities || '',
            features: project.features || '',
            mapLink: project.mapLink || '',
            projectContact: project.projectContact || '',
            projectEmail: project.projectEmail || '',
            projectType: project.projectType || 'Apartment',
            projectStatus: project.projectStatus || 'Pre Launch'
          });
        }
      }
    } catch (error) {
      console.error('Error fetching project:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        navigate('/projects/list');
      }
    } catch (error) {
      console.error('Error updating project:', error);
    }
  };

  return (
    <div className="edit-project-page">
      <div className="edit-project-header">
        <h2>Edit Projects</h2>
        <div className="page-breadcrumb">
          <Home size={14} style={{cursor: 'pointer'}} onClick={() => navigate('/projects/list')} />
          <span className="slash">/</span>
          <span>Home</span>
          <span className="slash">/</span>
          <span>Edit Projects</span>
        </div>
      </div>

      <div className="edit-project-content">
        <div className="form-container">
          <form onSubmit={handleSubmit} className="edit-project-form">
            
            <div className="form-group row-layout">
              <label className="field-label">Project Name :</label>
              <div className="field-input-wrapper">
                <input 
                  type="text" 
                  name="projectName" 
                  value={formData.projectName}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="form-group row-layout">
              <label className="field-label">Project Location :</label>
              <div className="field-input-wrapper">
                <input 
                  type="text" 
                  name="projectLocation" 
                  value={formData.projectLocation}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <MockRichTextEditor 
              label="Project Amenities :"
              name="projectAmenities"
              value={formData.projectAmenities}
              onChange={handleInputChange}
            />

            <MockRichTextEditor 
              label="Features :"
              name="features"
              value={formData.features}
              onChange={handleInputChange}
            />

            <div className="form-group row-layout">
              <label className="field-label">Map Link :</label>
              <div className="field-input-wrapper">
                <input 
                  type="text" 
                  name="mapLink"
                  placeholder="Map Link"
                  value={formData.mapLink}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="form-group row-layout">
              <label className="field-label">Project Contact :</label>
              <div className="field-input-wrapper">
                <input 
                  type="text" 
                  name="projectContact"
                  placeholder="Project Contact"
                  value={formData.projectContact}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="form-group row-layout">
              <label className="field-label">Project Email :</label>
              <div className="field-input-wrapper">
                <input 
                  type="text" 
                  name="projectEmail"
                  placeholder="Project Email"
                  value={formData.projectEmail}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <CustomSelect 
              label="Project Type :"
              options={projectTypes}
              value={formData.projectType}
              onChange={(val) => setFormData(prev => ({ ...prev, projectType: val }))}
            />

            <CustomSelect 
              label="Project Status :"
              options={projectStatuses}
              value={formData.projectStatus}
              onChange={(val) => setFormData(prev => ({ ...prev, projectStatus: val }))}
            />

            <div className="form-actions">
              <button type="submit" className="btn-edit-project">
                Edit Project
              </button>
            </div>
          </form>
        </div>

        <div className="side-panel">
          <div className="help-card">
            <h3>Need Help ?</h3>
            <div className="help-section">
              <h4>Edit Project</h4>
              <p>Project Can be Edited Here</p>
            </div>
            <div className="help-section">
              <h4>Update Amenities</h4>
              <p>Amenities Can be edited and updates with design</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
