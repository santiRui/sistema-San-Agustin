"use client";

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Session, User } from '@supabase/supabase-js';

// Define la estructura de los datos de la sesión
interface SessionContextData {
  session: Session | null;
  user: User | null;
  role: string | null;
  isLoading: boolean;
}

// Crea el contexto con un valor por defecto
const SessionContext = createContext<SessionContextData>({ 
  session: null, 
  user: null, 
  role: null, 
  isLoading: true 
});

// Crea el componente Proveedor
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getRoleFromUser = (u: User | null) => {
    if (!u) return null;
    const um: any = (u as any).user_metadata || {};
    const am: any = (u as any).app_metadata || {};
    return (um.role || am.role || um.rol || am.rol || null) as string | null;
  };

  const fetchRole = async (u: User | null) => {
    if (!u) return null;
    const { data, error } = await supabase.rpc('get_user_role');
    if (error) {
      const msg = String((error as any).message || '');
      const code = String((error as any).code || '');
      if (code === 'PGRST202' || msg.toLowerCase().includes('not found')) {
        return getRoleFromUser(u);
      }
      return getRoleFromUser(u);
    }
    return (data as any) ?? getRoleFromUser(u);
  };

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        const userRole = await fetchRole(session.user);
        setRole(userRole);
      }
      setIsLoading(false);
    };

    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const userRole = await fetchRole(session.user);
        setRole(userRole);
      } else {
        setRole(null);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const value = { session, user, role, isLoading };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

// Crea un hook personalizado para usar el contexto fácilmente
export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession debe ser usado dentro de un SessionProvider');
  }
  return context;
}
