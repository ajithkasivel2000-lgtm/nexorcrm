import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { channelPartnersService } from '../../services/channelPartners';

export default function EditChannelPartnerScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const { id } = route.params || {};

  const [isLoading, setIsLoading] = useState(true);
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
    accountDetails: {
      beneficiaryBankName: '',
      beneficiaryName: '',
      bankAccountNumber: '',
      ifscCode: ''
    }
  });

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const data = await channelPartnersService.getChannelPartner(id);
        setFormData({
          typeOfChannelPartner: data.typeOfChannelPartner || '',
          companyName: data.companyName || '',
          ownerName: data.ownerName || '',
          mobileNumber: data.mobileNumber || '',
          officeLandline: data.officeLandline || '',
          emailAddress: data.emailAddress || '',
          companyRegistrationNumber: data.companyRegistrationNumber || '',
          registeredAddress: data.registeredAddress || '',
          communicationAddress: data.communicationAddress || '',
          message: data.message || '',
          websiteUrl: data.websiteUrl || '',
          aadhaarNumber: data.aadhaarNumber || '',
          panOfCompany: data.panOfCompany || '',
          gstRegistrationNumber: data.gstRegistrationNumber || '',
          reraRegistrationNumber: data.reraRegistrationNumber || '',
          accountDetails: {
            beneficiaryBankName: data.accountDetails?.beneficiaryBankName || '',
            beneficiaryName: data.accountDetails?.beneficiaryName || '',
            bankAccountNumber: data.accountDetails?.bankAccountNumber || '',
            ifscCode: data.accountDetails?.ifscCode || ''
          }
        });
      } catch (e) {
        Alert.alert('Error', 'Failed to load partner details');
        navigation.goBack();
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id, navigation]);

  const set = (name) => (value) => setFormData((prev) => ({ ...prev, [name]: value }));
  const setAcc = (name) => (value) => setFormData((prev) => ({
    ...prev,
    accountDetails: { ...prev.accountDetails, [name]: value },
  }));

  const handleSubmit = async () => {
    if (!formData.companyName) {
      Alert.alert('Validation Error', 'Company Name is required.');
      return;
    }
    setIsSubmitting(true);
    try {
      await channelPartnersService.updateChannelPartner(id, formData);
      Alert.alert('Success', 'Channel Partner updated successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', e?.response?.data?.message || 'Failed to update channel partner');
    } finally {
      setIsSubmitting(false);
    }
  };

  const InputField = ({ label, value, onChangeText, keyboardType = 'default', multiline = false }) => (
    <View style={styles.fieldContainer}>
      <Text style={[styles.label, { color: colors.text.secondary }]}>{label}</Text>
      <TextInput
        style={[styles.input, { 
          backgroundColor: colors.bg.secondary, 
          borderColor: colors.border.default, 
          color: colors.text.primary,
          height: multiline ? 80 : 44,
          textAlignVertical: multiline ? 'top' : 'center'
        }]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        placeholderTextColor={colors.text.muted}
      />
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bg.primary }]}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg.primary }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.card, { backgroundColor: colors.bg.secondary, borderColor: colors.border.default }]}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Basic Details</Text>
          <InputField label="Type Of Channel Partner" value={formData.typeOfChannelPartner} onChangeText={set('typeOfChannelPartner')} />
          <InputField label="Company Name *" value={formData.companyName} onChangeText={set('companyName')} />
          <InputField label="Owner Name" value={formData.ownerName} onChangeText={set('ownerName')} />
          <InputField label="Mobile Number" value={formData.mobileNumber} onChangeText={set('mobileNumber')} keyboardType="phone-pad" />
          <InputField label="Office Landline" value={formData.officeLandline} onChangeText={set('officeLandline')} keyboardType="phone-pad" />
          <InputField label="Email Address" value={formData.emailAddress} onChangeText={set('emailAddress')} keyboardType="email-address" />
          <InputField label="Website URL" value={formData.websiteUrl} onChangeText={set('websiteUrl')} keyboardType="url" />
          
          <Text style={[styles.sectionTitle, { color: colors.text.primary, marginTop: 16 }]}>Address & Registration</Text>
          <InputField label="Company Registration Number" value={formData.companyRegistrationNumber} onChangeText={set('companyRegistrationNumber')} />
          <InputField label="Registered Address" value={formData.registeredAddress} onChangeText={set('registeredAddress')} multiline />
          <InputField label="Communication Address" value={formData.communicationAddress} onChangeText={set('communicationAddress')} multiline />
          
          <Text style={[styles.sectionTitle, { color: colors.text.primary, marginTop: 16 }]}>Tax & Legal Information</Text>
          <InputField label="Aadhaar Number" value={formData.aadhaarNumber} onChangeText={set('aadhaarNumber')} />
          <InputField label="PAN of Company" value={formData.panOfCompany} onChangeText={set('panOfCompany')} />
          <InputField label="GST Registration Number" value={formData.gstRegistrationNumber} onChangeText={set('gstRegistrationNumber')} />
          <InputField label="RERA Registration Number" value={formData.reraRegistrationNumber} onChangeText={set('reraRegistrationNumber')} />

          <Text style={[styles.sectionTitle, { color: colors.text.primary, marginTop: 16 }]}>Account Details</Text>
          <InputField label="Beneficiary Bank Name" value={formData.accountDetails.beneficiaryBankName} onChangeText={setAcc('beneficiaryBankName')} />
          <InputField label="Beneficiary Name" value={formData.accountDetails.beneficiaryName} onChangeText={setAcc('beneficiaryName')} />
          <InputField label="Bank Account Number" value={formData.accountDetails.bankAccountNumber} onChangeText={setAcc('bankAccountNumber')} />
          <InputField label="IFSC Code" value={formData.accountDetails.ifscCode} onChangeText={setAcc('ifscCode')} />
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.bg.secondary, borderTopColor: colors.border.default }]}>
        <TouchableOpacity 
          style={[styles.saveBtn, { backgroundColor: colors.brand.primary }]} 
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Feather name="save" size={16} color="#FFF" />
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: spacing.md,
    paddingBottom: 40,
  },
  card: {
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.sm,
  },
  fieldContainer: {
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: typography.size.sm,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
  },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 8,
    gap: 8,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
  }
});
