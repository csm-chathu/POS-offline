import { createSlice } from '@reduxjs/toolkit';

const stored = JSON.parse(localStorage.getItem('pos_auth') || 'null');

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    token:       stored?.token       || null,
    user:        stored?.user        || null,
    appSettings: stored?.appSettings || {},
    allFeatures: stored?.allFeatures || [],
  },
  reducers: {
    setCredentials(state, { payload }) {
      state.token       = payload.token;
      state.user        = payload.user;
      state.appSettings = payload.appSettings || {};
      state.allFeatures = payload.allFeatures || [];
      localStorage.setItem('pos_auth', JSON.stringify(payload));
    },
    logout(state) {
      state.token       = null;
      state.user        = null;
      state.appSettings = {};
      state.allFeatures = [];
      localStorage.removeItem('pos_auth');
    },
    updateSettings(state, { payload }) {
      state.appSettings = { ...state.appSettings, ...payload };
    },
  },
});

export const { setCredentials, logout, updateSettings } = authSlice.actions;
export default authSlice.reducer;

export const selectCurrentUser  = s => s.auth.user;
export const selectToken        = s => s.auth.token;
export const selectSettings     = s => s.auth.appSettings;
export const selectRole         = s => s.auth.user?.role ?? 'cashier';
export const selectFeatures     = s => s.auth.user?.features ?? null; // null = admin all access
export const selectAllFeatures  = s => s.auth.allFeatures;
