import React, { createContext, useContext, useState, ReactNode, useCallback, useRef } from 'react';
import { AutomationService } from '../services/AutomationService';

interface AutomationContextType {
  service: AutomationService | null;
  setWebview: (webview: Electron.WebviewTag) => void;
  // Control state
  isPaused: boolean;
  isAutomationActive: boolean;
  // Control methods - startAutomation now takes the service to ensure correct binding
  startAutomation: (svc: AutomationService) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  resetControl: () => void;
}

const AutomationContext = createContext<AutomationContextType | undefined>(undefined);

export const AutomationProvider = ({ children }: { children: ReactNode }) => {
  const [service, setService] = useState<AutomationService | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isAutomationActive, setIsAutomationActive] = useState(false);

  // Use refs for abort controller, pause resolver, and the ACTIVE service running automation
  const abortControllerRef = useRef<AbortController | null>(null);
  const pauseResolverRef = useRef<(() => void) | null>(null);
  // This ref stores the service that's CURRENTLY running an automation
  // It's set when startAutomation is called and cleared when resetControl is called
  const activeServiceRef = useRef<AutomationService | null>(null);

  const setWebview = useCallback((webview: Electron.WebviewTag) => {
    const newService = new AutomationService(webview);
    // If this service becomes active while an automation is running on it,
    // transfer the abort signal (edge case for tab switching during automation)
    if (activeServiceRef.current === null && abortControllerRef.current) {
      newService.setAbortSignal(abortControllerRef.current.signal);
    }
    setService(newService);
  }, []);

  const startAutomation = useCallback((svc: AutomationService) => {
    console.log('[AutomationContext] startAutomation called with service:', svc);
    // Create fresh AbortController for this automation run
    abortControllerRef.current = new AbortController();
    // Store the service that's running this automation
    activeServiceRef.current = svc;
    console.log('[AutomationContext] activeServiceRef.current set to:', activeServiceRef.current);
    // Set the abort signal on the EXACT service that will run the automation
    svc.setAbortSignal(abortControllerRef.current.signal);
    svc.setPausePromise(null);
    setIsPaused(false);
    setIsAutomationActive(true);
  }, []);

  const pause = useCallback(() => {
    console.log('[AutomationContext] pause called, activeServiceRef.current:', activeServiceRef.current, 'isPaused:', isPaused);
    // Use ref instead of state to avoid stale closure issues
    if (!activeServiceRef.current || isPaused) {
      console.log('[AutomationContext] pause early return - no active service or already paused');
      return;
    }

    // Create a promise that blocks until resume is called
    const promise = new Promise<void>((resolve) => {
      pauseResolverRef.current = resolve;
    });
    console.log('[AutomationContext] Setting pause promise on activeServiceRef.current');
    // Set the pause promise on the ACTIVE service (the one running the automation)
    activeServiceRef.current.setPausePromise(promise);
    setIsPaused(true);
  }, [isPaused]);

  const resume = useCallback(() => {
    console.log('[AutomationContext] resume called, isPaused:', isPaused);
    if (!isPaused) return;

    // Resolve the pause promise to unblock automation
    console.log('[AutomationContext] Resolving pause promise');
    pauseResolverRef.current?.();
    pauseResolverRef.current = null;
    activeServiceRef.current?.setPausePromise(null);
    setIsPaused(false);
  }, [isPaused]);

  const cancel = useCallback(() => {
    console.log('[AutomationContext] cancel called, abortControllerRef.current:', abortControllerRef.current, 'activeServiceRef.current:', activeServiceRef.current);

    // If there's a pause promise, resolve it first so the automation can proceed to the abort check
    if (pauseResolverRef.current) {
      console.log('[AutomationContext] Resolving pause promise before cancel');
      pauseResolverRef.current();
      pauseResolverRef.current = null;
      activeServiceRef.current?.setPausePromise(null);
    }

    // Abort the controller
    if (abortControllerRef.current) {
      console.log('[AutomationContext] Calling abort on abortControllerRef.current');
      abortControllerRef.current.abort();
    } else {
      console.log('[AutomationContext] WARNING: No abort controller to abort!');
    }
    setIsPaused(false);
    setIsAutomationActive(false);
  }, []);

  const resetControl = useCallback(() => {
    // Reset control state after automation completes
    activeServiceRef.current?.setAbortSignal(null);
    activeServiceRef.current?.setPausePromise(null);
    abortControllerRef.current = null;
    pauseResolverRef.current = null;
    activeServiceRef.current = null;
    setIsPaused(false);
    setIsAutomationActive(false);
  }, []);

  return (
    <AutomationContext.Provider value={{
      service,
      setWebview,
      isPaused,
      isAutomationActive,
      startAutomation,
      pause,
      resume,
      cancel,
      resetControl
    }}>
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
