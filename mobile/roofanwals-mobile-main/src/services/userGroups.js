import api from './api';

export const getUserGroups = async () => {
  const response = await api.get('/user-groups');
  return response.data;
};

export const createUserGroup = async (data) => {
  const response = await api.post('/user-groups', data);
  return response.data;
};

export const updateUserGroup = async (id, data) => {
  const response = await api.put(`/user-groups/${id}`, data);
  return response.data;
};

export const deleteUserGroup = async (id) => {
  const response = await api.delete(`/user-groups/${id}`);
  return response.data;
};
