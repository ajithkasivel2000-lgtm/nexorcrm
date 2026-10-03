import api from './api';

export const getEmailTemplates = async () => {
  const response = await api.get('/settings/email-templates');
  return response.data;
};

export const createEmailTemplate = async (data) => {
  const response = await api.post('/settings/email-templates', data);
  return response.data;
};

export const updateEmailTemplate = async (id, data) => {
  const response = await api.put(`/settings/email-templates/${id}`, data);
  return response.data;
};

export const deleteEmailTemplate = async (id) => {
  const response = await api.delete(`/settings/email-templates/${id}`);
  return response.data;
};
