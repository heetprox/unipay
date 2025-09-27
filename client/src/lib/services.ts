import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_RELAYER_API_URL || 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds 
});
