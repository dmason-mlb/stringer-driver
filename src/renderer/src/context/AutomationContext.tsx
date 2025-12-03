import React, { createContext, useContext, useState, ReactNode } from 'react';
import { AutomationService } from '../services/AutomationService';

interface AutomationContextType {
  service: AutomationService | null;
  setWebview: (webview: Electron.WebviewTag) => void;
}

const AutomationContext = createContext<AutomationContextType | undefined>(undefined);

export const AutomationProvider = ({ children }: { children: ReactNode }) => {
  const [service, setService] = useState<AutomationService | null>(null);

  const setWebview = (webview: Electron.WebviewTag) => {
    setService(new AutomationService(webview));
  };

  return (
    <AutomationContext.Provider value={{ service, setWebview }}>
      {children}
    </AutomationContext.Provider>
  );
};

export const useAutomation = () => {
  const context = useContext(AutomationContext);
  if (!context) {
    throw new Error('useAutomation must be used within an AutomationProvider');
  }
  return context;
};

