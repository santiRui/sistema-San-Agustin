"use client"

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface AlertState {
  message: string;
  type: 'success' | 'error';
}

interface AlertContextType {
  showAlert: (message: string, type: 'success' | 'error') => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alert, setAlert] = useState<AlertState | null>(null);

  const showAlert = (message: string, type: 'success' | 'error') => {
    setAlert({ message, type });
    setTimeout(() => {
      setAlert(null);
    }, 5000); // La alerta desaparecerá después de 5 segundos
  };

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      {alert && (
        <div 
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '16px',
            borderRadius: '8px',
            color: 'white',
            backgroundColor: alert.type === 'success' ? '#28a745' : '#dc3545',
            zIndex: 1000,
            boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
          }}
        >
          {alert.message}
        </div>
      )}
    </AlertContext.Provider>
  );
}
