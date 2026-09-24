import api from './api';

export const getLeadAssignmentSettings = async () => {
  const response = await api.get('/settings/lead-assignment');
  return response.data;
};

export const updateLeadAssignmentSettings = async (data) => {
  const response = await api.put('/settings/lead-assignment', data);
  return response.data;
};

export const getReminderSettings = async () => {
  const response = await api.get('/settings/reminders');
  return response.data;
};

export const updateReminderSettings = async (data) => {
  const response = await api.put('/settings/reminders', data);
  return response.data;
};

export const getMailSettings = async () => {
  const response = await api.get('/settings/mail');
  return response.data;
};

export const updateMailSettings = async (data) => {
  const response = await api.put('/settings/mail', data);
  return response.data;
};

export const testMailConnection = async (data) => {
  const response = await api.post('/settings/mail/test', data);
  return response.data;
};

export const getRegistrationSettings = async () => {
  const response = await api.get('/settings/registration');
  return response.data;
};

export const updateRegistrationSettings = async (data) => {
  const response = await api.put('/settings/registration', data);
  return response.data;
};

export const getSessionSettings = async () => {
  const response = await api.get('/settings/session');
  return response.data;
};

export const updateSessionSettings = async (data) => {
  const response = await api.put('/settings/session', data);
  return response.data;
};

export const getUserSettings = async () => {
  const response = await api.get('/settings/user');
  return response.data;
};

export const updateUserSettings = async (data) => {
  const response = await api.put('/settings/user', data);
  return response.data;
};

export const getSecuritySettings = async () => {
  const response = await api.get('/settings/security');
  return response.data;
};

export const updateSecuritySettings = async (data) => {
  const response = await api.put('/settings/security', data);
  return response.data;
};
