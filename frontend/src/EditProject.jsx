import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Boxes, Building2, IndianRupee, LayoutGrid, Info, MapPin,
} from 'lucide-react';
import { useRecordTitle } from './hooks/usePageMeta';
import './EditProject.css';
import invalidateLeadCache from './utils/invalidateLeadCache';
import ProjectOverview from './project/ProjectOverview';
import ProjectInventory from './project/ProjectInventory';
import {
  Button, emailError, normalizeEmail,
  RecordCard, RecordColumn, RecordField, RecordFields, RecordGrid,
  RecordLookupField, RecordPage, toDateInput, toast,
} from './ui';

/**
 * The project record.
 *
 * Grouped into sections behind tabs rather than one long form: a project has
 * eighty-odd fields, and a single column of them is unreadable however neatly
 * it is spaced. Overview is what most people come for; the rest is there when
 * it is wanted.
 *
 * The nine original fields — name, location, amenities, features, map link,
 * contact, email, type, status — are all still here and still save exactly as
 * they did. They simply live in the section each belongs to.
 */

const TABS = [
  { key: 'Overview', icon: LayoutGrid },
  { key: 'Basic Information', icon: Info },
  { key: 'Location', icon: MapPin },
  { key: 'Configuration', icon: Building2 },
  { key: 'Inventory', icon: Boxes },
  { key: 'Pricing', icon: IndianRupee },
];

const CATEGORIES = [
  'Residential', 'Commercial', 'Villa', 'Apartment', 'Plot',
  'Mixed Development', 'Luxury', 'Affordable', 'Other',
];
const FACING = ['East', 'West', 'North', 'South', 'Multiple'];
const AREA_UNITS = ['acre', 'sq ft', 'sq m', 'cent', 'ground', 'hectare'];

/** Every field the form holds, so a missing key never makes an input uncontrolled. */
const BLANK = {
  // The original nine.
  projectName: '', projectLocation: '', projectAmenities: '', features: '',
  mapLink: '', projectContact: '', projectEmail: '', projectType: 'Apartment',
  projectStatus: 'Pre Launch',
  // Identity.
  projectCode: '', slug: '', category: '', shortDescription: '', description: '',
  developers: '', builder: '', promoter: '', projectManager: '', salesManager: '',
  website: '', reraNumber: '', reraDate: '', launchDate: '',
  // Location.
  addressLine1: '', addressLine2: '', landmark: '', area: '', locality: '',
  city: '', district: '', state: '', country: 'India', pincode: '',
  latitude: '', longitude: '', mapEmbedUrl: '', locationNote: '',
  // Configuration.
  landArea: '', landAreaUnit: 'acre', builtUpArea: '', saleableArea: '', commonArea: '',
  totalBuildings: '', totalFloors: '', totalUnitsPlanned: '',
  parkingCapacity: '', openParking: '', coveredParking: '', visitorParking: '', facing: '',
  // Pricing.
  startingPrice: '', minPrice: '', maxPrice: '', pricePerSqft: '',
  minArea: '', maxArea: '', bookingAmount: '', maintenanceCharges: '',
  corpusFund: '', parkingCharges: '', floorRiseCharges: '', clubHouseCharges: '',
  otherCharges: '', gstPercent: '', registrationPercent: '', stampDutyPercent: '',
};

const DATE_FIELDS = [
  'reraDate', 'launchDate',
];

export default function EditProject() {
  const { id } = useParams();

  const [formData, setFormData] = useState(BLANK);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Overview');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useRecordTitle(formData?.projectName);

  const fetchProject = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${id}`);
      if (!response.ok) return;
      const project = await response.json();
      // Merged onto BLANK so every input stays controlled whatever the API omits.
      const next = { ...BLANK };
      for (const key of Object.keys(BLANK)) {
        const value = project[key];
        if (value === null || value === undefined) continue;
        next[key] = DATE_FIELDS.includes(key) ? toDateInput(value) : value;
      }
      setFormData(next);
    } catch (error) {
      console.error('Error fetching project:', error);
    }
  }, [id]);

  /* The counted figures. Read separately and re-read after every save, since
     a change to a price or a date changes most of them. */
  const fetchSummary = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${id}/summary`);
      if (response.ok) setSummary(await response.json());
    } catch (error) {
      console.error('Error fetching the project summary:', error);
    } finally {
      setSummaryLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchProject(); fetchSummary(); }, [fetchProject, fetchSummary]);

  const set = (name) => (value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  /**
   * What must be true before it can be saved.
   *
   * Checked here and enforced again on the server: a form is a convenience,
   * not a guarantee.
   */
  const validate = () => {
    const found = {};
    if (!formData.projectName.trim()) found.projectName = 'A project name is required';

    const email = emailError(formData.projectEmail, { label: 'Project email' });
    if (email) found.projectEmail = email;

    if (formData.projectContact && !/^[6-9]\d{9}$/.test(String(formData.projectContact).trim())) {
      found.projectContact = 'Enter a 10-digit Indian mobile number';
    }
    if (formData.pincode && !/^\d{6}$/.test(String(formData.pincode).trim())) {
      found.pincode = 'A pincode is six digits';
    }

    // Negative money or area is always a typo.
    for (const key of ['startingPrice', 'minPrice', 'maxPrice', 'pricePerSqft', 'bookingAmount',
      'landArea', 'builtUpArea', 'saleableArea', 'minArea', 'maxArea']) {
      const v = formData[key];
      if (v !== '' && Number(v) < 0) found[key] = 'Cannot be negative';
    }

    if (formData.minPrice && formData.maxPrice && Number(formData.minPrice) > Number(formData.maxPrice)) {
      found.maxPrice = 'Maximum cannot be below the minimum';
    }

    return found;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      // Sends the reader to the problem rather than leaving them to find it.
      toast.error(Object.values(found)[0]);
      return;
    }

    setSaving(true);
    try {
      // Blanks are sent as null so a cleared field clears in the database
      // rather than being stored as an empty string.
      const payload = {};
      for (const [key, value] of Object.entries(formData)) {
        payload[key] = value === '' ? null : value;
      }

      const response = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(body?.message || 'Could not save the project.');
        return;
      }

      // Leads reference projects, so a project edit refreshes every lead view.
      invalidateLeadCache();
      toast.success('Project saved.');
      fetchProject();
      fetchSummary();
    } catch (error) {
      console.error('Error updating project:', error);
      toast.error('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  /** A field, wired to state and to its validation message. */
  const field = (name, label, extra = {}) => (
    <RecordField
      label={label}
      value={formData[name]}
      onChange={set(name)}
      error={errors[name]}
      {...extra}
    />
  );

  return (
    <RecordPage
      crumbs={[{ label: 'Projects', to: '/projects/list' }]}
      title={formData.projectName || 'Project'}
      backTo="/projects/list"
      backLabel="Back to Projects"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      /* Inventory saves each building and unit as it goes, so the page-level
         save button would have nothing to do there. */
      actions={activeTab === 'Inventory' ? null : (
        <Button variant="primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving…' : 'Save Project'}
        </Button>
      )}
    >
      {/* Outside the form on purpose: its modals carry their own inputs, and
          Enter in one of them must not submit the project. */}
      {activeTab === 'Inventory' && (
        <ProjectInventory projectId={id} onChanged={fetchSummary} />
      )}

      <form
        onSubmit={handleSubmit}
        hidden={activeTab === 'Inventory'}
        style={{ display: activeTab === 'Inventory' ? 'none' : 'flex', flexDirection: 'column', gap: 'var(--nx-space-4)' }}
      >
        {activeTab === 'Overview' && (
          <>
            <ProjectOverview summary={summary} loading={summaryLoading} />
            <RecordGrid cols={1}>
              <RecordColumn>
                <RecordCard icon={Info} title="At a glance">
                  <RecordFields cols={2}>
                    {field('projectName', 'Project Name :', { required: true })}
                    {field('projectCode', 'Project Code :')}
                    <RecordLookupField
                      label="Project Type :"
                      apiUrl="/api/project-types"
                      displayKey="typeName" valueKey="typeName" postPayloadKey="typeName"
                      placeholder="Select Project Type"
                      value={formData.projectType}
                      onSave={set('projectType')}
                    />
                    <RecordLookupField
                      label="Project Status :"
                      apiUrl="/api/project-statuses"
                      displayKey="statusName" valueKey="statusName" postPayloadKey="statusName"
                      placeholder="Select Project Status"
                      value={formData.projectStatus}
                      onSave={set('projectStatus')}
                    />
                    {field('projectLocation', 'Project Location :')}
                    {field('projectManager', 'Project Manager :')}
                  </RecordFields>
                </RecordCard>
              </RecordColumn>
            </RecordGrid>
          </>
        )}

        {activeTab === 'Basic Information' && (
          <RecordGrid cols={2}>
            <RecordColumn>
              <RecordCard icon={Info} title="Project Information">
                <RecordFields cols={1}>
                  {field('projectName', 'Project Name :', { required: true })}
                  {field('projectCode', 'Project Code :')}
                  {field('slug', 'URL Slug :')}
                  {field('category', 'Category :', { options: CATEGORIES })}
                  {field('shortDescription', 'Short Description :')}
                  {field('description', 'Description :', { multiline: true })}
                </RecordFields>
              </RecordCard>
            </RecordColumn>
            <RecordColumn>
              <RecordCard icon={Building2} title="Developer & Contact">
                <RecordFields cols={1}>
                  {field('developers', 'Developer :')}
                  {field('builder', 'Builder :')}
                  {field('promoter', 'Promoter :')}
                  {field('projectManager', 'Project Manager :')}
                  {field('salesManager', 'Sales Manager :')}
                  {field('projectContact', 'Project Contact (Mobile) :')}
                  {field('projectEmail', 'Project Email :', {
                    type: 'email',
                    normalize: normalizeEmail,
                    validate: (v) => emailError(v, { label: 'Project email' }),
                  })}
                  {field('website', 'Website :')}
                  {field('reraNumber', 'RERA Number :')}
                  {field('reraDate', 'RERA Registration Date :', { type: 'date' })}
                  {field('launchDate', 'Launch Date :', { type: 'date' })}
                </RecordFields>
              </RecordCard>
            </RecordColumn>
          </RecordGrid>
        )}

        {activeTab === 'Location' && (
          <RecordGrid cols={2}>
            <RecordColumn>
              <RecordCard icon={MapPin} title="Address">
                <RecordFields cols={1}>
                  {field('addressLine1', 'Address Line 1 :')}
                  {field('addressLine2', 'Address Line 2 :')}
                  {field('landmark', 'Landmark :')}
                  {field('area', 'Area :')}
                  {field('locality', 'Locality :')}
                  {field('city', 'City :')}
                  {field('district', 'District :')}
                  {field('state', 'State :')}
                  {field('country', 'Country :')}
                  {field('pincode', 'Pincode :')}
                </RecordFields>
              </RecordCard>
            </RecordColumn>
            <RecordColumn>
              <RecordCard icon={MapPin} title="Map & Description">
                <RecordFields cols={1}>
                  {field('projectLocation', 'Project Location (summary) :')}
                  {field('mapLink', 'Map Link :')}
                  {field('mapEmbedUrl', 'Google Maps Embed URL :')}
                  {field('latitude', 'Latitude :')}
                  {field('longitude', 'Longitude :')}
                  {field('locationNote', 'Location Description :', { multiline: true })}
                </RecordFields>
              </RecordCard>
            </RecordColumn>
          </RecordGrid>
        )}

        {activeTab === 'Configuration' && (
          <RecordGrid cols={2}>
            <RecordColumn>
              <RecordCard icon={Building2} title="Area & Structure">
                <RecordFields cols={2}>
                  {field('landArea', 'Total Land Area :')}
                  {field('landAreaUnit', 'Unit :', { options: AREA_UNITS })}
                  {field('builtUpArea', 'Built-up Area :')}
                  {field('saleableArea', 'Saleable Area :')}
                  {field('commonArea', 'Common Area :')}
                  {field('facing', 'Facing :', { options: FACING })}
                  {/* What is planned. What exists is counted from the units
                      table once Phase 2 lands, so the two never merge. */}
                  {field('totalBuildings', 'Number of Buildings (planned) :')}
                  {field('totalFloors', 'Number of Floors :')}
                  {field('totalUnitsPlanned', 'Number of Units (planned) :')}
                </RecordFields>
              </RecordCard>
            </RecordColumn>
            <RecordColumn>
              <RecordCard icon={Building2} title="Parking">
                <RecordFields cols={2}>
                  {field('parkingCapacity', 'Parking Capacity :')}
                  {field('openParking', 'Open Parking :')}
                  {field('coveredParking', 'Covered Parking :')}
                  {field('visitorParking', 'Visitor Parking :')}
                </RecordFields>
              </RecordCard>

              <RecordCard icon={LayoutGrid} title="Amenities & Features">
                <RecordFields cols={1}>
                  {/* Free text for now; Phase 3 turns these into rows with a
                      category and an order, and carries the text across. */}
                  {field('projectAmenities', 'Project Amenities :', { multiline: true })}
                  {field('features', 'Features :', { multiline: true })}
                </RecordFields>
              </RecordCard>
            </RecordColumn>
          </RecordGrid>
        )}

        {activeTab === 'Pricing' && (
          <RecordGrid cols={2}>
            <RecordColumn>
              <RecordCard icon={IndianRupee} title="Price">
                <RecordFields cols={2}>
                  {field('startingPrice', 'Starting Price :')}
                  {field('pricePerSqft', 'Price per Sq Ft :')}
                  {field('minPrice', 'Minimum Price :')}
                  {field('maxPrice', 'Maximum Price :')}
                  {field('minArea', 'Minimum Area :')}
                  {field('maxArea', 'Maximum Area :')}
                  {field('bookingAmount', 'Booking Amount :')}
                </RecordFields>
              </RecordCard>
            </RecordColumn>
            <RecordColumn>
              <RecordCard icon={IndianRupee} title="Charges & Tax">
                <RecordFields cols={2}>
                  {field('maintenanceCharges', 'Maintenance :')}
                  {field('corpusFund', 'Corpus Fund :')}
                  {field('parkingCharges', 'Parking :')}
                  {field('floorRiseCharges', 'Floor Rise :')}
                  {field('clubHouseCharges', 'Club House :')}
                  {field('otherCharges', 'Other Charges :')}
                  {field('gstPercent', 'GST % :')}
                  {field('registrationPercent', 'Registration % :')}
                  {field('stampDutyPercent', 'Stamp Duty % :')}
                </RecordFields>
              </RecordCard>
            </RecordColumn>
          </RecordGrid>
        )}

        {/* A submit button so Enter saves from any field, without a second
            visible control beside the one in the header. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </RecordPage>
  );
}
