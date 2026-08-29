import axios from 'axios';

let envUrl = import.meta.env.VITE_API_URL || '/api';
if (envUrl && !envUrl.startsWith('http') && !envUrl.startsWith('/')) {
  envUrl = 'https://' + envUrl;
}
const baseURL = envUrl.replace(/\/+$/, '');

const api = axios.create({
  baseURL
});

// Interceptor to inject JWT token and client Gemini key on every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
