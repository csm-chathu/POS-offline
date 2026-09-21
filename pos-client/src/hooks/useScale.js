import { useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { selectToken } from '../features/auth/authSlice';
import { getApiUrl } from '../config/runtimeConfig';

/**
 * Public hook for checking network scale connection status.
 *
 * Usage:
 *   const { status, error, checkConnection } = useScale();
 *   await checkConnection();   // 'connected' | 'disconnected'
 *
 * status: 'idle' | 'checking' | 'connected' | 'disconnected'
 */
export function useScale() {
  const [status, setStatus] = useState('idle');
  const [error,  setError]  = useState('');
  const token = useSelector(selectToken);

  const checkConnection = useCallback(async () => {
    if (!token) return;
    setStatus('checking');
    setError('');
    try {
      const res  = await fetch(`${getApiUrl()}/api/scale/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setStatus(data.connected ? 'connected' : 'disconnected');
      setError(data.error || '');
      return data.connected;
    } catch (e) {
      setStatus('disconnected');
      setError(e.message);
      return false;
    }
  }, [token]);

  return { status, error, checkConnection };
}
