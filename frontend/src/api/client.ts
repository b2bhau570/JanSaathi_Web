import axios from 'axios';

const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach JWT if present
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('doctor_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('doctor_token');
      localStorage.removeItem('doctor_data');
      // Only redirect if on a doctor page (not patient)
      if (window.location.pathname.startsWith('/doctor') &&
          !window.location.pathname.includes('/login') &&
          !window.location.pathname.includes('/register')) {
        window.location.href = '/doctor/login';
      }
    }
    return Promise.reject(error);
  },
);

export default client;
