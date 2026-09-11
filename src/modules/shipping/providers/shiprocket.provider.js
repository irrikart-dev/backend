import axios from 'axios';
import env from '../../../config/env.js';

// shipping.service.js talks to this interface, never to axios/shiprocket urls directly
const client = axios.create({ baseURL: 'https://apiv2.shiprocket.in/v1/external' });

let tokenCache = null;

async function authenticate() {
  if (tokenCache) return tokenCache;
  const { data } = await client.post('/auth/login', {
    email: env.SHIPROCKET_EMAIL,
    password: env.SHIPROCKET_PASSWORD,
  });
  tokenCache = data.token;
  return tokenCache;
}

async function withAuth() {
  const token = await authenticate();
  return { headers: { Authorization: `Bearer ${token}` } };
}

export const checkServiceability = async (params) =>
  client.get('/courier/serviceability', { ...(await withAuth()), params });

export const createOrder = async (payload) => client.post('/orders/create/adhoc', payload, await withAuth());

export const trackShipment = async (shipmentId) =>
  client.get(`/courier/track/shipment/${shipmentId}`, await withAuth());
