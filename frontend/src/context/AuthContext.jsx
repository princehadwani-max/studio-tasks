import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setApiTenantId } from '../api/client';

const AuthContext = createContext(null);
const STORAGE_KEY = 'studio_tasks_session';

function normalizeLegacySession(parsed) {
  if (!parsed || !parsed.user) return parsed;
  const user = { ...parsed.user };
  if (user.username === 'prince' || user.role === 'super_admin') {
    user.role = 'super_admin';
    user.role_label = 'Super Admin';
    user.companyId = null;
    user.companyName = null;
    user.companySlug = null;
  } else if (!user.companyId || user.companySlug === 'studio') {
    user.companyId = user.companyId || 1;
    user.companyName = 'Starco Ceramics';
    user.companySlug = 'starco';
  }
  return { ...parsed, user };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [activeTenant, setActiveTenant] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = normalizeLegacySession(JSON.parse(raw));
        setSession(parsed);
        if (parsed.user.role === 'super_admin') {
          setActiveTenant(null);
          setApiTenantId(null);
        } else {
          const initialTenant = {
            id: parsed.user.companyId || 1,
            name: parsed.user.companyName || 'Starco Ceramics',
            slug: parsed.user.companySlug || 'starco',
            features: parsed.user.companyFeatures || {
              whatsapp: true,
              routines: true,
              remarks: true,
              team_management: true,
            },
          };
          setActiveTenant(initialTenant);
          setApiTenantId(initialTenant.id);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setReady(true);
  }, []);

  const login = useCallback(async (username, password, companySlug) => {
    const { token, user } = await api.login(username, password, companySlug);
    const next = normalizeLegacySession({ token, user });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
    if (next.user.role === 'super_admin') {
      setActiveTenant(null);
      setApiTenantId(null);
    } else {
      const tenant = {
        id: next.user.companyId || 1,
        name: next.user.companyName || 'Starco Ceramics',
        slug: next.user.companySlug || 'starco',
        features: next.user.companyFeatures || {
          whatsapp: true,
          routines: true,
          remarks: true,
          team_management: true,
        },
      };
      setActiveTenant(tenant);
      setApiTenantId(tenant.id);
    }
    return next;
  }, []);

  const switchTenant = useCallback((tenant) => {
    if (!tenant) {
      setActiveTenant(null);
      setApiTenantId(null);
      return;
    }
    const normalized = {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      features: tenant.features || {
        whatsapp: true,
        routines: true,
        remarks: true,
        team_management: true,
      },
    };
    setActiveTenant(normalized);
    setApiTenantId(normalized.id);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setActiveTenant(null);
    setApiTenantId(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, activeTenant, switchTenant, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
