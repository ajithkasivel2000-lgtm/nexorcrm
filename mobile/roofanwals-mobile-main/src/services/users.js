import api from './api';

export const getUsers = async () => {
  const response = await api.get('/users');
  return response.data;
};

export const createUser = async (userData) => {
  const response = await api.post('/users', userData);
  return response.data;
};

export const updateUser = async (userId, userData) => {
  const response = await api.put(`/users/${userId}`, userData);
  return response.data;
};

export const getUserOverview = async (userId = 'me') => {
  const response = await api.get(`/users/${userId}/overview`);
  return response.data;
};

export const getUserStats = async (userId = 'me') => {
  const response = await api.get(`/users/${userId}/stats`);
  return response.data;
};

export const getUserSessions = async (userId = 'me') => {
  const response = await api.get(`/users/${userId}/sessions`);
  return response.data;
};

export const getUserAuditLogs = async (userId = 'me', action = null) => {
  const url = action ? `/users/${userId}/audit?action=${action}` : `/users/${userId}/audit`;
  const response = await api.get(url);
  return response.data;
};

export const getUserPreferences = async (userId = 'me') => {
  const response = await api.get(`/users/${userId}/preferences`);
  return response.data;
};

export const updateUserPreferences = async (userId = 'me', data) => {
  const response = await api.put(`/users/${userId}/preferences`, data);
  return response.data;
};

export const resetUserPassword = async (userId, data) => {
  const response = await api.post(`/users/${userId}/reset-password`, data);
  return response.data;
};

export const forcePasswordChange = async (userId) => {
  const response = await api.post(`/users/${userId}/force-password-change`);
  return response.data;
};

export const revokeUserSessions = async (userId) => {
  const response = await api.post(`/users/${userId}/revoke-sessions`);
  return response.data;
};
