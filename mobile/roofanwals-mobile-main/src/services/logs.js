import api from './api';

export const getLogs = async () => {
  const response = await api.get('/logs');
  return response.data;
};

export const deleteAllLogs = async () => {
  const response = await api.delete('/logs/all');
  return response.data;
};

export const deleteOldLogs = async () => {
  const response = await api.delete('/logs/old');
  return response.data;
};
