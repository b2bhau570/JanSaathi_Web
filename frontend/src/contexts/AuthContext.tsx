import {
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { Doctor, AuthResponse } from '../types';
import { AuthContext } from './useAuth';

function readInitialAuthState(): { doctor: Doctor | null; token: string | null } {
  try {
    const savedToken = localStorage.getItem('doctor_token');
    const savedDoctor = localStorage.getItem('doctor_data');
    if (savedToken && savedDoctor) {
      return { token: savedToken, doctor: JSON.parse(savedDoctor) as Doctor };
    }
  } catch {
    localStorage.removeItem('doctor_token');
    localStorage.removeItem('doctor_data');
  }
  return { token: null, doctor: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialAuth] = useState(readInitialAuthState);
  const [doctor, setDoctor] = useState<Doctor | null>(initialAuth.doctor);
  const [token, setToken] = useState<string | null>(initialAuth.token);
  const isLoading = false;

  const login = useCallback((response: AuthResponse) => {
    localStorage.setItem('doctor_token', response.access_token);
    localStorage.setItem('doctor_data', JSON.stringify(response.doctor));
    setToken(response.access_token);
    setDoctor(response.doctor);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('doctor_token');
    localStorage.removeItem('doctor_data');
    setToken(null);
    setDoctor(null);
  }, []);

  const updateDoctor = useCallback((d: Doctor) => {
    localStorage.setItem('doctor_data', JSON.stringify(d));
    setDoctor(d);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        doctor,
        token,
        isAuthenticated: !!token && !!doctor,
        isLoading,
        login,
        logout,
        updateDoctor,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
