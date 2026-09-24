import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { getApiUrl } from '../config/runtimeConfig';
import { logout } from '../features/auth/authSlice';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${getApiUrl()}/api`,
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});

async function baseQueryWithAuth(args, api, extraOptions) {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status === 401) {
    api.dispatch(logout());
  }
  return result;
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Products', 'Sales', 'Customers', 'Purchases', 'Suppliers', 'Categories', 'Users', 'UserFeatures', 'Settings', 'Dashboard', 'Accounts', 'JournalEntries', 'TrialBalance'],
  keepUnusedDataFor: 300,
  endpoints: () => ({}),
});
