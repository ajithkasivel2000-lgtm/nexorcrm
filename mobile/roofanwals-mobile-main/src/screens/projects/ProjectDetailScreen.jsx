import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { projectsService } from '../../services/projects';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

const TABS = ['Overview', 'Basic Information', 'Location', 'Configuration', 'Inventory', 'Pricing'];

export default function ProjectDetailScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { id, name } = route.params;
  
  const [project, setProject] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');
  
  const [showAddBuilding, setShowAddBuilding] = useState(false);
  const [bForm, setBForm] = useState({
    name: '', code: '', towerNumber: '', floors: '',
    status: 'Planned', progress: '', expectedCompletion: '', description: ''
  });

  const [showAddFloorPlan, setShowAddFloorPlan] = useState(false);
  const [fpForm, setFpForm] = useState({
    building: 'No building (plots)', numberPrefix: 'A-', unitsPerFloor: '4',
    fromFloor: '1', toFloor: '1', status: 'Available',
    configuration: '', facing: '', unitType: 'Apartment',
    carpetArea: '', saleableArea: '', priceEach: ''
  });

  const [showAddUnit, setShowAddUnit] = useState(false);
  const [uForm, setUForm] = useState({
    building: 'No building (plot)', unitNumber: '', floor: '',
    configuration: '', unitType: 'Apartment', facing: '',
    carpetArea: '', builtUpArea: '', saleableArea: '',
    price: '', pricePerSqFt: '', parkingSlots: '',
    status: 'Available', heldFor: '', notes: ''
  });

  const [form, setForm] = useState({
    projectName: '', projectCode: '', projectType: '', 
    projectStatus: '', city: '', projectManager: '',
    description: '', category: '', reraNumber: '', expectedCompletion: '',
    developer: '', builder: '', promoter: '', salesManager: '',
    addressLine1: '', addressLine2: '', landmark: '', area: '', locality: '', city: '', district: '', state: '', country: 'India', pincode: '',
    projectLocationSummary: '', mapLink: '', googleMapsEmbedUrl: '', latitude: '', longitude: '', locationDescription: '',
    totalUnits: '', constructionProgress: '',
    totalLandArea: '', landAreaUnit: 'acre', builtUpArea: '', saleableArea: '', commonArea: '', facing: '', numberOfBuildings: '', numberOfFloors: '',
    parkingCapacity: '', openParking: '', coveredParking: '', visitorParking: '',
    projectAmenities: '', projectFeatures: '',
    startingPrice: '', pricePerSqft: '', currency: 'INR',
    minimumPrice: '', maximumPrice: '', minimumArea: '', maximumArea: '', bookingAmount: '',
    maintenance: '', corpusFund: '', parkingCharges: '', floorRise: '', clubHouse: '', otherCharges: '',
    gst: '', registration: '', stampDuty: ''
  });

  const load = useCallback(async () => {
    if (id === 'new') {
      setProject({ name: 'New Project' });
      setSummary({ counts: { activities: 0, tasks: 0, contacts: 0, documents: 0, notes: 0 }, crm: { leads: 0, opportunities: 0 }, gaps: [] });
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const [projRes, sumRes] = await Promise.all([
        projectsService.getProject(id),
        projectsService.getProjectSummary(id)
      ]);
      
      const p = projRes?.project || projRes?.data || projRes;
      setProject(p);
      setSummary(sumRes);
      
      setForm({
        projectName: p.projectName || p.name || '',
        projectCode: p.projectCode || '',
        projectType: p.projectType || p.type || '',
        projectStatus: p.projectStatus || p.status || '',
        city: p.city || p.location || '',
        projectManager: p.projectManager || '',
        description: p.description || '',
        category: p.category || '',
        reraNumber: p.reraNumber || '',
        expectedCompletion: p.expectedCompletion ? new Date(p.expectedCompletion).toISOString().split('T')[0] : '',
        developer: p.developer || '',
        builder: p.builder || '',
        promoter: p.promoter || '',
        salesManager: p.salesManager || '',
        addressLine1: p.addressLine1 || '',
        addressLine2: p.addressLine2 || '',
        landmark: p.landmark || '',
        area: p.area || '',
        locality: p.locality || '',
        city: p.city || p.location || '',
        district: p.district || '',
        state: p.state || '',
        country: p.country || 'India',
        pincode: p.pincode || '',
        projectLocationSummary: p.projectLocationSummary || p.location || '',
        mapLink: p.mapLink || '',
        googleMapsEmbedUrl: p.googleMapsEmbedUrl || '',
        latitude: p.latitude || '',
        longitude: p.longitude || '',
        locationDescription: p.locationDescription || '',
        totalUnits: p.totalUnits?.toString() || '',
        constructionProgress: p.constructionProgress?.toString() || '',
        totalLandArea: p.totalLandArea || '',
        landAreaUnit: p.landAreaUnit || 'acre',
        builtUpArea: p.builtUpArea || '',
        saleableArea: p.saleableArea || '',
        commonArea: p.commonArea || '',
        facing: p.facing || '',
        numberOfBuildings: p.numberOfBuildings?.toString() || '',
        numberOfFloors: p.numberOfFloors?.toString() || '',
        parkingCapacity: p.parkingCapacity?.toString() || '',
        openParking: p.openParking?.toString() || '',
        coveredParking: p.coveredParking?.toString() || '',
        visitorParking: p.visitorParking?.toString() || '',
        projectAmenities: p.projectAmenities || '',
        projectFeatures: p.projectFeatures || '',
        startingPrice: p.startingPrice?.toString() || '',
        pricePerSqft: p.pricePerSqft?.toString() || '',
        currency: p.currency || 'INR',
        minimumPrice: p.minimumPrice?.toString() || '',
        maximumPrice: p.maximumPrice?.toString() || '',
        minimumArea: p.minimumArea?.toString() || '',
        maximumArea: p.maximumArea?.toString() || '',
        bookingAmount: p.bookingAmount?.toString() || '',
        maintenance: p.maintenance?.toString() || '',
        corpusFund: p.corpusFund?.toString() || '',
        parkingCharges: p.parkingCharges?.toString() || '',
        floorRise: p.floorRise?.toString() || '',
        clubHouse: p.clubHouse?.toString() || '',
        otherCharges: p.otherCharges?.toString() || '',
        gst: p.gst?.toString() || '',
        registration: p.registration?.toString() || '',
        stampDuty: p.stampDuty?.toString() || ''
      });
      
    } catch (e) {
      console.error('Failed to load project details:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: 'bold' }}>
          Projects : {name || form.projectName}
        </Text>
      ),
      headerRight: () => activeTab !== 'Inventory' ? (
        <TouchableOpacity style={{ marginRight: 15, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.brand.primary, borderRadius: 6 }}>
          <Text style={{ color: colors.brand.primary, fontWeight: '600' }}>Save Project</Text>
        </TouchableOpacity>
      ) : null
    });
  }, [id, name, colors, form.projectName, activeTab, navigation]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg.primary }]}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
      </View>
    );
  }

  if (!project || !summary) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg.primary }]}>
        <Text style={{ color: colors.text.muted }}>Failed to load project data.</Text>
      </View>
    );
  }

  const themed = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg.primary },
    tabsWrap: { 
      borderBottomWidth: 1, borderBottomColor: colors.border.default,
      backgroundColor: colors.bg.secondary
    },
    tabBtn: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabBtnActive: { borderBottomColor: colors.brand.primary },
    tabText: { color: colors.text.secondary, fontSize: typography.size.sm, fontWeight: typography.weight.medium },
    tabTextActive: { color: colors.brand.primary, fontWeight: typography.weight.bold },
    
    content: { padding: spacing.md, gap: spacing.md },
    
    // Summary Cards
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    summaryCard: {
      flexBasis: '48%', flexGrow: 1, backgroundColor: colors.bg.secondary, 
      borderWidth: 1, borderColor: colors.border.default, borderRadius: spacing.radius.md,
      padding: spacing.md, gap: 4
    },
    scHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    scIconBox: { backgroundColor: colors.bg.tertiary, padding: 6, borderRadius: 6 },
    scTitle: { color: colors.text.muted, fontSize: typography.size.xs },
    scValue: { color: colors.text.primary, fontSize: typography.size.lg, fontWeight: typography.weight.bold, marginTop: 4 },
    scDesc: { color: colors.text.muted, fontSize: 10 },

    // Counts Row
    countsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 4, marginVertical: 8 },
    countItem: { alignItems: 'center' },
    countVal: { color: colors.text.primary, fontSize: 18, fontWeight: 'bold' },
    countLbl: { color: colors.text.muted, fontSize: 11, marginTop: 2 },
    
    // Gaps Block
    gapsBlock: {
      backgroundColor: '#FEF3C7', // Amber 100
      borderWidth: 1, borderColor: '#F59E0B', // Amber 500
      borderRadius: spacing.radius.md,
      padding: spacing.md,
      flexDirection: 'row', flexWrap: 'wrap', gap: 12
    },
    gapItem: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '45%' },
    gapText: { color: '#B45309', fontSize: 12, fontWeight: '600' }, // Amber 700

    // Form Section
    formCard: {
      backgroundColor: colors.bg.secondary,
      borderWidth: 1, borderColor: colors.border.default,
      borderRadius: spacing.radius.md,
      padding: spacing.md,
    },
    formHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
    formTitle: { color: colors.text.primary, fontSize: typography.size.base, fontWeight: typography.weight.bold },
    inputGroup: { marginBottom: 16 },
    label: { color: colors.text.secondary, fontSize: typography.size.sm, marginBottom: 6, fontWeight: '500' },
    input: {
      borderWidth: 1, borderColor: colors.border.default, borderRadius: spacing.radius.md,
      paddingHorizontal: 12, paddingVertical: 10, color: colors.text.primary, fontSize: typography.size.sm
    }
  });

  return (
    <View style={themed.root}>
      {/* Tabs */}
      <View style={themed.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {TABS.map(tab => (
            <TouchableOpacity 
              key={tab} 
              style={[themed.tabBtn, activeTab === tab && themed.tabBtnActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[themed.tabText, activeTab === tab && themed.tabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView 
        contentContainerStyle={themed.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {activeTab === 'Overview' ? (
          <>
            {/* Top 4 Cards */}
            <View style={themed.summaryGrid}>
              <View style={themed.summaryCard}>
                <View style={themed.scHeader}>
                  <View style={themed.scIconBox}><Feather name="box" size={14} color={colors.brand.primary} /></View>
                  <Text style={themed.scTitle}>Inventory</Text>
                </View>
                <Text style={themed.scValue}>{summary.inventory ? summary.inventory.total : 'Not set up'}</Text>
                <Text style={themed.scDesc}>{summary.inventory ? 'Inventory tracked' : 'Add buildings and units to track this'}</Text>
              </View>
              
              <View style={themed.summaryCard}>
                <View style={themed.scHeader}>
                  <View style={themed.scIconBox}><Text style={{ color: colors.brand.primary, fontSize: 12, fontWeight: 'bold' }}>₹</Text></View>
                  <Text style={themed.scTitle}>Starting price</Text>
                </View>
                <Text style={themed.scValue}>{summary.startingPrice ? `₹${summary.startingPrice}` : '—'}</Text>
                <Text style={themed.scDesc}>{summary.pricePerSqft ? `₹${summary.pricePerSqft} / sq ft` : 'Price per sq ft not set'}</Text>
              </View>
              
              <View style={themed.summaryCard}>
                <View style={themed.scHeader}>
                  <View style={themed.scIconBox}><Feather name="users" size={14} color={colors.brand.primary} /></View>
                  <Text style={themed.scTitle}>Leads</Text>
                </View>
                <Text style={themed.scValue}>{summary.crm.leads}</Text>
                <Text style={themed.scDesc}>{summary.crm.opportunities} opportunity</Text>
              </View>
              
              <View style={themed.summaryCard}>
                <View style={themed.scHeader}>
                  <View style={themed.scIconBox}><Feather name="calendar" size={14} color={colors.brand.primary} /></View>
                  <Text style={themed.scTitle}>Completion</Text>
                </View>
                <Text style={themed.scValue}>{project.expectedCompletion ? new Date(project.expectedCompletion).toLocaleDateString() : '—'}</Text>
                <Text style={themed.scDesc}>{project.expectedCompletion ? 'Expected' : 'No expected date set'}</Text>
              </View>
            </View>

            {/* Counts Row */}
            <View style={themed.countsRow}>
              {[
                { label: 'Activities', val: summary.counts.activities },
                { label: 'Tasks', val: summary.counts.tasks },
                { label: 'Contacts', val: summary.counts.contacts },
                { label: 'Documents', val: summary.counts.documents },
                { label: 'Notes', val: summary.counts.notes },
                { label: 'Age days', val: summary.age ?? '—', highlight: true }
              ].map((c, i) => (
                <View key={i} style={themed.countItem}>
                  <Text style={themed.countVal}>{c.val}</Text>
                  <Text style={[themed.countLbl, c.highlight && { color: '#D97706' }]}>{c.label}</Text>
                </View>
              ))}
            </View>

            {/* Gaps / Warnings */}
            {summary.gaps?.length > 0 && (
              <View style={themed.gapsBlock}>
                {summary.gaps.map((gap, i) => (
                  <View key={i} style={themed.gapItem}>
                    <Feather name="alert-triangle" size={14} color="#B45309" />
                    <Text style={themed.gapText}>{gap}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* At a Glance Form */}
            <View style={themed.formCard}>
              <View style={themed.formHeader}>
                <Feather name="info" size={18} color={colors.brand.primary} />
                <Text style={themed.formTitle}>At a glance</Text>
              </View>

              <View style={themed.inputGroup}>
                <Text style={themed.label}>Project Name *</Text>
                <TextInput style={themed.input} value={form.projectName} onChangeText={t => setForm({...form, projectName: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Project Code</Text>
                <TextInput style={themed.input} value={form.projectCode} onChangeText={t => setForm({...form, projectCode: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Project Type</Text>
                <TextInput style={themed.input} value={form.projectType} onChangeText={t => setForm({...form, projectType: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Project Status</Text>
                <TextInput style={themed.input} value={form.projectStatus} onChangeText={t => setForm({...form, projectStatus: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Project Location</Text>
                <TextInput style={themed.input} value={form.city} onChangeText={t => setForm({...form, city: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Project Manager</Text>
                <TextInput style={themed.input} value={form.projectManager} onChangeText={t => setForm({...form, projectManager: t})} />
              </View>
            </View>
          </>
        ) : activeTab === 'Basic Information' ? (
          <View style={{ gap: spacing.md }}>
            <View style={themed.formCard}>
              <View style={themed.formHeader}>
                <Feather name="file-text" size={18} color={colors.brand.primary} />
                <Text style={themed.formTitle}>Information</Text>
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Description</Text>
                <TextInput style={[themed.input, { height: 80, textAlignVertical: 'top' }]} multiline value={form.description} onChangeText={t => setForm({...form, description: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Category</Text>
                <TextInput style={themed.input} value={form.category} onChangeText={t => setForm({...form, category: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>RERA Number</Text>
                <TextInput style={themed.input} value={form.reraNumber} onChangeText={t => setForm({...form, reraNumber: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Expected Completion (YYYY-MM-DD)</Text>
                <TextInput style={themed.input} value={form.expectedCompletion} onChangeText={t => setForm({...form, expectedCompletion: t})} />
              </View>
            </View>

            <View style={themed.formCard}>
              <View style={themed.formHeader}>
                <Feather name="users" size={18} color={colors.brand.primary} />
                <Text style={themed.formTitle}>Developer & Contact</Text>
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Developer</Text>
                <TextInput style={themed.input} value={form.developer} onChangeText={t => setForm({...form, developer: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Builder</Text>
                <TextInput style={themed.input} value={form.builder} onChangeText={t => setForm({...form, builder: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Promoter</Text>
                <TextInput style={themed.input} value={form.promoter} onChangeText={t => setForm({...form, promoter: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Project Manager</Text>
                <TextInput style={themed.input} value={form.projectManager} onChangeText={t => setForm({...form, projectManager: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Sales Manager</Text>
                <TextInput style={themed.input} value={form.salesManager} onChangeText={t => setForm({...form, salesManager: t})} />
              </View>
            </View>
          </View>
        ) : activeTab === 'Location' ? (
          <View style={{ gap: spacing.md }}>
            <View style={themed.formCard}>
              <View style={themed.formHeader}>
                <Feather name="map-pin" size={18} color={colors.brand.primary} />
                <Text style={themed.formTitle}>Address</Text>
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Address Line 1 :</Text>
                <TextInput style={themed.input} value={form.addressLine1} onChangeText={t => setForm({...form, addressLine1: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Address Line 2 :</Text>
                <TextInput style={themed.input} value={form.addressLine2} onChangeText={t => setForm({...form, addressLine2: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Landmark :</Text>
                <TextInput style={themed.input} value={form.landmark} onChangeText={t => setForm({...form, landmark: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Area :</Text>
                <TextInput style={themed.input} value={form.area} onChangeText={t => setForm({...form, area: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Locality :</Text>
                <TextInput style={themed.input} value={form.locality} onChangeText={t => setForm({...form, locality: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>City :</Text>
                <TextInput style={themed.input} value={form.city} onChangeText={t => setForm({...form, city: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>District :</Text>
                <TextInput style={themed.input} value={form.district} onChangeText={t => setForm({...form, district: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>State :</Text>
                <TextInput style={themed.input} value={form.state} onChangeText={t => setForm({...form, state: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Country :</Text>
                <TextInput style={themed.input} value={form.country} onChangeText={t => setForm({...form, country: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Pincode :</Text>
                <TextInput style={themed.input} value={form.pincode} onChangeText={t => setForm({...form, pincode: t})} keyboardType="numeric" />
              </View>
            </View>

            <View style={themed.formCard}>
              <View style={themed.formHeader}>
                <Feather name="map" size={18} color={colors.brand.primary} />
                <Text style={themed.formTitle}>Map & Description</Text>
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Project Location (summary) :</Text>
                <TextInput style={themed.input} value={form.projectLocationSummary} onChangeText={t => setForm({...form, projectLocationSummary: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Map Link :</Text>
                <TextInput style={themed.input} value={form.mapLink} onChangeText={t => setForm({...form, mapLink: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Google Maps Embed URL :</Text>
                <TextInput style={themed.input} value={form.googleMapsEmbedUrl} onChangeText={t => setForm({...form, googleMapsEmbedUrl: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Latitude :</Text>
                <TextInput style={themed.input} value={form.latitude} onChangeText={t => setForm({...form, latitude: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Longitude :</Text>
                <TextInput style={themed.input} value={form.longitude} onChangeText={t => setForm({...form, longitude: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Location Description :</Text>
                <TextInput style={[themed.input, { height: 80, textAlignVertical: 'top' }]} multiline value={form.locationDescription} onChangeText={t => setForm({...form, locationDescription: t})} />
              </View>
            </View>
          </View>
        ) : activeTab === 'Configuration' ? (
          <View style={{ gap: spacing.md }}>
            <View style={themed.formCard}>
              <View style={themed.formHeader}>
                <Feather name="layout" size={18} color={colors.brand.primary} />
                <Text style={themed.formTitle}>Area & Structure</Text>
              </View>
              
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Total Land Area :</Text>
                  <TextInput style={themed.input} value={form.totalLandArea} onChangeText={t => setForm({...form, totalLandArea: t})} />
                </View>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Unit :</Text>
                  <TextInput style={themed.input} value={form.landAreaUnit} onChangeText={t => setForm({...form, landAreaUnit: t})} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Built-up Area :</Text>
                  <TextInput style={themed.input} value={form.builtUpArea} onChangeText={t => setForm({...form, builtUpArea: t})} />
                </View>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Saleable Area :</Text>
                  <TextInput style={themed.input} value={form.saleableArea} onChangeText={t => setForm({...form, saleableArea: t})} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Common Area :</Text>
                  <TextInput style={themed.input} value={form.commonArea} onChangeText={t => setForm({...form, commonArea: t})} />
                </View>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Facing :</Text>
                  <TextInput style={themed.input} value={form.facing} onChangeText={t => setForm({...form, facing: t})} placeholder="Select" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Number of Buildings (planned) :</Text>
                  <TextInput style={themed.input} value={form.numberOfBuildings} onChangeText={t => setForm({...form, numberOfBuildings: t})} keyboardType="numeric" />
                </View>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Number of Floors :</Text>
                  <TextInput style={themed.input} value={form.numberOfFloors} onChangeText={t => setForm({...form, numberOfFloors: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={themed.inputGroup}>
                <Text style={themed.label}>Number of Units (planned) :</Text>
                <TextInput style={themed.input} value={form.totalUnits} onChangeText={t => setForm({...form, totalUnits: t})} keyboardType="numeric" />
              </View>
            </View>

            <View style={themed.formCard}>
              <View style={themed.formHeader}>
                <Feather name="truck" size={18} color={colors.brand.primary} />
                <Text style={themed.formTitle}>Parking</Text>
              </View>
              
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Parking Capacity :</Text>
                  <TextInput style={themed.input} value={form.parkingCapacity} onChangeText={t => setForm({...form, parkingCapacity: t})} keyboardType="numeric" />
                </View>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Open Parking :</Text>
                  <TextInput style={themed.input} value={form.openParking} onChangeText={t => setForm({...form, openParking: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Covered Parking :</Text>
                  <TextInput style={themed.input} value={form.coveredParking} onChangeText={t => setForm({...form, coveredParking: t})} keyboardType="numeric" />
                </View>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Visitor Parking :</Text>
                  <TextInput style={themed.input} value={form.visitorParking} onChangeText={t => setForm({...form, visitorParking: t})} keyboardType="numeric" />
                </View>
              </View>
            </View>

            <View style={themed.formCard}>
              <View style={themed.formHeader}>
                <Feather name="star" size={18} color={colors.brand.primary} />
                <Text style={themed.formTitle}>Amenities & Features</Text>
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Project Amenities :</Text>
                <TextInput style={[themed.input, { height: 80, textAlignVertical: 'top' }]} multiline value={form.projectAmenities} onChangeText={t => setForm({...form, projectAmenities: t})} />
              </View>
              <View style={themed.inputGroup}>
                <Text style={themed.label}>Features :</Text>
                <TextInput style={[themed.input, { height: 80, textAlignVertical: 'top' }]} multiline value={form.projectFeatures} onChangeText={t => setForm({...form, projectFeatures: t})} />
              </View>
            </View>
          </View>
        ) : activeTab === 'Pricing' ? (
          <View style={{ gap: spacing.md }}>
            <View style={themed.formCard}>
              <View style={themed.formHeader}>
                <Text style={{ color: colors.brand.primary, fontSize: 16, fontWeight: 'bold', marginLeft: 2, width: 18, textAlign: 'center' }}>₹</Text>
                <Text style={themed.formTitle}>Price</Text>
              </View>
              
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Starting Price :</Text>
                  <TextInput style={themed.input} value={form.startingPrice} onChangeText={t => setForm({...form, startingPrice: t})} keyboardType="numeric" />
                </View>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Price per Sq Ft :</Text>
                  <TextInput style={themed.input} value={form.pricePerSqft} onChangeText={t => setForm({...form, pricePerSqft: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Minimum Price :</Text>
                  <TextInput style={themed.input} value={form.minimumPrice} onChangeText={t => setForm({...form, minimumPrice: t})} keyboardType="numeric" />
                </View>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Maximum Price :</Text>
                  <TextInput style={themed.input} value={form.maximumPrice} onChangeText={t => setForm({...form, maximumPrice: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Minimum Area :</Text>
                  <TextInput style={themed.input} value={form.minimumArea} onChangeText={t => setForm({...form, minimumArea: t})} keyboardType="numeric" />
                </View>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Maximum Area :</Text>
                  <TextInput style={themed.input} value={form.maximumArea} onChangeText={t => setForm({...form, maximumArea: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={[themed.inputGroup, { width: '48%' }]}>
                <Text style={themed.label}>Booking Amount :</Text>
                <TextInput style={themed.input} value={form.bookingAmount} onChangeText={t => setForm({...form, bookingAmount: t})} keyboardType="numeric" />
              </View>
            </View>

            <View style={themed.formCard}>
              <View style={themed.formHeader}>
                <Text style={{ color: colors.brand.primary, fontSize: 16, fontWeight: 'bold', marginLeft: 2, width: 18, textAlign: 'center' }}>%</Text>
                <Text style={themed.formTitle}>Charges & Tax</Text>
              </View>
              
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Maintenance :</Text>
                  <TextInput style={themed.input} value={form.maintenance} onChangeText={t => setForm({...form, maintenance: t})} keyboardType="numeric" />
                </View>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Corpus Fund :</Text>
                  <TextInput style={themed.input} value={form.corpusFund} onChangeText={t => setForm({...form, corpusFund: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Parking :</Text>
                  <TextInput style={themed.input} value={form.parkingCharges} onChangeText={t => setForm({...form, parkingCharges: t})} keyboardType="numeric" />
                </View>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Floor Rise :</Text>
                  <TextInput style={themed.input} value={form.floorRise} onChangeText={t => setForm({...form, floorRise: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Club House :</Text>
                  <TextInput style={themed.input} value={form.clubHouse} onChangeText={t => setForm({...form, clubHouse: t})} keyboardType="numeric" />
                </View>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Other Charges :</Text>
                  <TextInput style={themed.input} value={form.otherCharges} onChangeText={t => setForm({...form, otherCharges: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>GST % :</Text>
                  <TextInput style={themed.input} value={form.gst} onChangeText={t => setForm({...form, gst: t})} keyboardType="numeric" />
                </View>
                <View style={[themed.inputGroup, { flex: 1 }]}>
                  <Text style={themed.label}>Registration % :</Text>
                  <TextInput style={themed.input} value={form.registration} onChangeText={t => setForm({...form, registration: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={[themed.inputGroup, { width: '48%' }]}>
                <Text style={themed.label}>Stamp Duty % :</Text>
                <TextInput style={themed.input} value={form.stampDuty} onChangeText={t => setForm({...form, stampDuty: t})} keyboardType="numeric" />
              </View>
            </View>
          </View>
        ) : activeTab === 'Inventory' ? (
          <View style={themed.formCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="layers" size={18} color={colors.brand.primary} />
                <Text style={themed.formTitle}>Inventory</Text>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <TouchableOpacity 
                  onPress={() => setShowAddBuilding(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border.default, borderRadius: 6 }}
                >
                  <Feather name="plus" size={14} color={colors.text.secondary} />
                  <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '500' }}>Add building</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => setShowAddFloorPlan(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border.default, borderRadius: 6 }}
                >
                  <Feather name="layout" size={14} color={colors.text.secondary} />
                  <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '500' }}>Add a floor plan</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => setShowAddUnit(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.brand.primary, borderRadius: 6, backgroundColor: colors.brand.primary + '10' }}
                >
                  <Feather name="plus" size={14} color={colors.brand.primary} />
                  <Text style={{ color: colors.brand.primary, fontSize: 13, fontWeight: '600' }}>Add unit</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 20 }}>
              No units recorded yet. Add a building, then a floor plan — every figure on the Overview is counted from these rows.
            </Text>
          </View>
        ) : (
          <View style={[styles.center, { marginTop: 40 }]}>
            <Feather name="tool" size={40} color={colors.border.default} style={{ marginBottom: 16 }} />
            <Text style={{ color: colors.text.secondary }}>{activeTab} is under construction</Text>
          </View>
        )}
      </ScrollView>

      {/* Add Building Modal */}
      <Modal visible={showAddBuilding} transparent animationType="fade" onRequestClose={() => setShowAddBuilding(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { backgroundColor: colors.bg.primary }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Add a building</Text>
                <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 2 }}>A tower or block. Plotted developments can skip this and add units directly.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAddBuilding(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: spacing.md }} showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Name *</Text>
                  <TextInput style={themed.input} placeholder="Tower A" value={bForm.name} onChangeText={t => setBForm({...bForm, name: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Code</Text>
                  <TextInput style={themed.input} value={bForm.code} onChangeText={t => setBForm({...bForm, code: t})} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Tower number</Text>
                  <TextInput style={themed.input} value={bForm.towerNumber} onChangeText={t => setBForm({...bForm, towerNumber: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Floors</Text>
                  <TextInput style={themed.input} value={bForm.floors} onChangeText={t => setBForm({...bForm, floors: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Status</Text>
                  <TextInput style={themed.input} value={bForm.status} onChangeText={t => setBForm({...bForm, status: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Construction progress (%)</Text>
                  <TextInput style={themed.input} value={bForm.progress} onChangeText={t => setBForm({...bForm, progress: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={themed.label}>Expected completion</Text>
                <View style={[themed.input, { flexDirection: 'row', alignItems: 'center' }]}>
                  <TextInput style={{ flex: 1, color: colors.text.primary, padding: 0 }} placeholder="dd-mm-yyyy" placeholderTextColor={colors.text.muted} value={bForm.expectedCompletion} onChangeText={t => setBForm({...bForm, expectedCompletion: t})} />
                  <Feather name="calendar" size={16} color={colors.text.muted} />
                </View>
              </View>

              <View style={{ marginBottom: 24 }}>
                <Text style={themed.label}>Description</Text>
                <TextInput style={[themed.input, { height: 80, textAlignVertical: 'top' }]} multiline value={bForm.description} onChangeText={t => setBForm({...bForm, description: t})} />
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: colors.border.default }]}>
              <TouchableOpacity onPress={() => setShowAddBuilding(false)} style={styles.btnCancel}>
                <Text style={{ color: colors.text.secondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnSave, { borderColor: colors.brand.primary }]}>
                <Text style={{ color: colors.brand.primary, fontWeight: '600' }}>Save building</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Floor Plan Modal */}
      <Modal visible={showAddFloorPlan} transparent animationType="fade" onRequestClose={() => setShowAddFloorPlan(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { backgroundColor: colors.bg.primary }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Add a floor plan</Text>
                <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 2 }}>Generates one unit per position per floor. Anything unusual can be edited afterwards.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAddFloorPlan(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: spacing.md }} showsVerticalScrollIndicator={false}>
              
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1.5 }}>
                  <Text style={themed.label}>Building</Text>
                  <TextInput style={themed.input} value={fpForm.building} onChangeText={t => setFpForm({...fpForm, building: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Number prefix</Text>
                  <TextInput style={themed.input} value={fpForm.numberPrefix} onChangeText={t => setFpForm({...fpForm, numberPrefix: t})} />
                  <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 4 }}>A- gives A-101, A-102...</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Units per floor</Text>
                  <TextInput style={themed.input} value={fpForm.unitsPerFloor} onChangeText={t => setFpForm({...fpForm, unitsPerFloor: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>From floor</Text>
                  <TextInput style={themed.input} value={fpForm.fromFloor} onChangeText={t => setFpForm({...fpForm, fromFloor: t})} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>To floor</Text>
                  <TextInput style={themed.input} value={fpForm.toFloor} onChangeText={t => setFpForm({...fpForm, toFloor: t})} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Status</Text>
                  <TextInput style={themed.input} value={fpForm.status} onChangeText={t => setFpForm({...fpForm, status: t})} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Configuration</Text>
                  <TextInput style={themed.input} placeholder="Select" value={fpForm.configuration} onChangeText={t => setFpForm({...fpForm, configuration: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Facing</Text>
                  <TextInput style={themed.input} placeholder="Select" value={fpForm.facing} onChangeText={t => setFpForm({...fpForm, facing: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Unit type</Text>
                  <TextInput style={themed.input} value={fpForm.unitType} onChangeText={t => setFpForm({...fpForm, unitType: t})} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Carpet area (sq ft)</Text>
                  <TextInput style={themed.input} value={fpForm.carpetArea} onChangeText={t => setFpForm({...fpForm, carpetArea: t})} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Saleable area (sq ft)</Text>
                  <TextInput style={themed.input} value={fpForm.saleableArea} onChangeText={t => setFpForm({...fpForm, saleableArea: t})} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Price each (₹)</Text>
                  <TextInput style={themed.input} value={fpForm.priceEach} onChangeText={t => setFpForm({...fpForm, priceEach: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={{ marginTop: 12, marginBottom: 24, padding: 12, borderWidth: 1, borderColor: colors.border.default, borderRadius: 6 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 13 }}>
                  {fpForm.unitsPerFloor} units: 101, 102, 103, 104
                </Text>
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: colors.border.default }]}>
              <TouchableOpacity onPress={() => setShowAddFloorPlan(false)} style={styles.btnCancel}>
                <Text style={{ color: colors.text.secondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnSave, { borderColor: colors.brand.primary }]}>
                <Text style={{ color: colors.brand.primary, fontWeight: '600' }}>{`Add ${fpForm.unitsPerFloor} units`}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Unit Modal */}
      <Modal visible={showAddUnit} transparent animationType="fade" onRequestClose={() => setShowAddUnit(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { backgroundColor: colors.bg.primary }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Add a unit</Text>
                <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 2 }}>The status is the inventory — availability, sales and value are all counted from it.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAddUnit(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: spacing.md }} showsVerticalScrollIndicator={false}>
              
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Building</Text>
                  <TextInput style={themed.input} value={uForm.building} onChangeText={t => setUForm({...uForm, building: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Unit number *</Text>
                  <TextInput style={themed.input} value={uForm.unitNumber} onChangeText={t => setUForm({...uForm, unitNumber: t})} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Floor</Text>
                  <TextInput style={themed.input} value={uForm.floor} onChangeText={t => setUForm({...uForm, floor: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Configuration</Text>
                  <TextInput style={themed.input} placeholder="Select" value={uForm.configuration} onChangeText={t => setUForm({...uForm, configuration: t})} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Unit type</Text>
                  <TextInput style={themed.input} value={uForm.unitType} onChangeText={t => setUForm({...uForm, unitType: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Facing</Text>
                  <TextInput style={themed.input} placeholder="Select" value={uForm.facing} onChangeText={t => setUForm({...uForm, facing: t})} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Carpet area (sq ft)</Text>
                  <TextInput style={themed.input} value={uForm.carpetArea} onChangeText={t => setUForm({...uForm, carpetArea: t})} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Built-up area (sq ft)</Text>
                  <TextInput style={themed.input} value={uForm.builtUpArea} onChangeText={t => setUForm({...uForm, builtUpArea: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Saleable area (sq ft)</Text>
                  <TextInput style={themed.input} value={uForm.saleableArea} onChangeText={t => setUForm({...uForm, saleableArea: t})} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Price (₹)</Text>
                  <TextInput style={themed.input} value={uForm.price} onChangeText={t => setUForm({...uForm, price: t})} keyboardType="numeric" />
                  <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 4 }}>Left blank, this unit is left out of every value total.</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Price per sq ft (₹)</Text>
                  <TextInput style={themed.input} value={uForm.pricePerSqFt} onChangeText={t => setUForm({...uForm, pricePerSqFt: t})} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Parking slots</Text>
                  <TextInput style={themed.input} value={uForm.parkingSlots} onChangeText={t => setUForm({...uForm, parkingSlots: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Status</Text>
                  <TextInput style={themed.input} value={uForm.status} onChangeText={t => setUForm({...uForm, status: t})} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={themed.label}>Held for</Text>
                  <TextInput style={themed.input} placeholder="Customer name" value={uForm.heldFor} onChangeText={t => setUForm({...uForm, heldFor: t})} />
                </View>
              </View>

              <View style={{ marginBottom: 24 }}>
                <Text style={themed.label}>Notes</Text>
                <TextInput style={[themed.input, { height: 80, textAlignVertical: 'top' }]} multiline value={uForm.notes} onChangeText={t => setUForm({...uForm, notes: t})} />
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: colors.border.default }]}>
              <TouchableOpacity onPress={() => setShowAddUnit(false)} style={styles.btnCancel}>
                <Text style={{ color: colors.text.secondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnSave, { borderColor: colors.brand.primary }]}>
                <Text style={{ color: colors.brand.primary, fontWeight: '600' }}>Save unit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.md },
  modalContent: { width: '100%', maxWidth: 500, borderRadius: 12, overflow: 'hidden', maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', padding: spacing.md, borderTopWidth: 1, gap: 12 },
  btnCancel: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#CBD5E1' },
  btnSave: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, borderWidth: 1 }
});
