// Centralized API Configuration
// You can override window.API_HOST manually (e.g. '192.168.1.100')
// or leave it undefined to automatically use the browser's current IP/hostname.

const API_HOST = window.API_HOST || window.location.hostname || 'localhost';
const API_PORT = window.API_PORT || '5000';
const API_BASE_URL = `http://${API_HOST}:${API_PORT}/api/v1`;
