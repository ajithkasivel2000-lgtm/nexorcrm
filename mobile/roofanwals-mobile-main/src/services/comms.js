import * as FileSystem from 'expo-file-system/legacy';
import api, { getApiBaseUrl } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** WhatsApp, click-to-call and documents on a lead (same API as the web app). */
export const commsService = {
  async whatsappThread(leadId) {
    return (await api.get(`/leads/${leadId}/whatsapp`)).data;
  },
  async sendWhatsApp(leadId, body) {
    return (await api.post(`/leads/${leadId}/whatsapp`, body)).data;
  },
  async calls(leadId) {
    return (await api.get(`/leads/${leadId}/calls`)).data;
  },
  async placeCall(leadId) {
    return (await api.post(`/leads/${leadId}/call`)).data;
  },
  async documents(entityType, entityId) {
    return (await api.get(`/records/${entityType}/${entityId}/documents`)).data;
  },
  async uploadDocument(entityType, entityId, { uri, name, mimeType, category = 'Other' }) {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return (await api.post(`/records/${entityType}/${entityId}/documents/upload`, {
      fileName: name, category, dataUrl: `data:${mimeType || 'application/octet-stream'};base64,${b64}`,
    })).data;
  },
  /** Downloads a document to the cache and returns its local path. */
  async downloadDocument(doc) {
    const token = await AsyncStorage.getItem('authToken');
    const safe = String(doc.fileName || 'file').replace(/[^\w.-]/g, '_');
    const target = `${FileSystem.cacheDirectory}${safe}`;
    const res = await FileSystem.downloadAsync(`${getApiBaseUrl()}/documents/${doc.id}/download`, target, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status !== 200) throw new Error('Download failed.');
    return res.uri;
  },
};
