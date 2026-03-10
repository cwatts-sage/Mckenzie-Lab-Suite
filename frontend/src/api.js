import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'https://lab-inventory-api.azurewebsites.net/api';

const api = axios.create({
  baseURL: API_BASE,
});

// Add auth token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  updateSettings: (data) => api.put('/auth/settings', data),
};

// Storage
export const storageAPI = {
  getUnits: () => api.get('/storage/units'),
  createUnit: (data) => api.post('/storage/units', data),
  updateUnit: (id, data) => api.put(`/storage/units/${id}`, data),
  deleteUnit: (id) => api.delete(`/storage/units/${id}`),
  getLocations: (unitId) => api.get('/storage/locations', { params: { unit_id: unitId } }),
  createLocation: (data) => api.post('/storage/locations', data),
  deleteLocation: (id) => api.delete(`/storage/locations/${id}`),
};

// Reagents
export const reagentAPI = {
  getAll: (params) => api.get('/reagents', { params }),
  getNotifications: () => api.get('/reagents/notifications'),
  export: (ids) => api.get('/reagents/export', { params: { ids: ids?.join(',') } }),
  create: (data) => api.post('/reagents', data),
  update: (id, data) => api.put(`/reagents/${id}`, data),
  delete: (id) => api.delete(`/reagents/${id}`),
};

// Admin
export const adminAPI = {
  getUsers: () => api.get('/manage/users'),
  approveUser: (id) => api.put(`/manage/users/${id}/approve`),
  disableUser: (id) => api.put(`/manage/users/${id}/disable`),
  enableUser: (id) => api.put(`/manage/users/${id}/enable`),
  deleteUser: (id) => api.delete(`/manage/users/${id}`),
};

// Experiments
export const experimentAPI = {
  getAll: () => api.get('/experiments'),
  getOne: (id) => api.get(`/experiments/${id}`),
  create: (data) => api.post('/experiments', data),
  update: (id, data) => api.put(`/experiments/${id}`, data),
  delete: (id) => api.delete(`/experiments/${id}`),
};

// Notebook
export const notebookAPI = {
  getAll: (params) => api.get('/notebook', { params }),
  create: (data) => api.post('/notebook', data),
  update: (id, data) => api.put(`/notebook/${id}`, data),
  delete: (id) => api.delete(`/notebook/${id}`),
  getHistory: (id) => api.get(`/notebook/${id}/history`),
};

// Hub
export const hubAPI = {
  getSummary: () => api.get('/hub/summary'),
};

// Catalog
export const catalogAPI = {
  getAll: (params) => api.get('/catalog', { params }),
  create: (data) => api.post('/catalog', data),
  scrape: (url) => api.post('/catalog/scrape', { url }),
  delete: (id) => api.delete(`/catalog/${id}`),
};

// Samples
export const sampleAPI = {
  getAll: (params) => api.get('/samples', { params }),
  create: (data) => api.post('/samples', data),
  update: (id, data) => api.put(`/samples/${id}`, data),
  delete: (id) => api.delete(`/samples/${id}`),
  getReferences: (id) => api.get(`/samples/${id}/references`),
};

export default api;
