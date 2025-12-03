import React, { useEffect, useRef } from 'react'
import { useAutomation } from '../context/AutomationContext'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        useragent?: string;
        partition?: string;
        allowpopups?: string;
        webpreferences?: string;
      }
    }
  }
}

export const StringerView = () => {
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const { setWebview } = useAutomation();

  useEffect(() => {
    const webview = webviewRef.current;
    if (webview) {
      setWebview(webview);
      webview.addEventListener('dom-ready', () => {
        console.log('Stringer view loaded');
        // openDevTools for the webview for debugging
        // (webview as any).openDevTools();
      });
    }
  }, [setWebview]);

  return (
    <div className="flex-1 h-full bg-white relative">
        <webview
            ref={webviewRef as any}
            src="https://stringer-qa.bdatasf.mlbinfra.com/client/index.html"
            className="w-full h-full"
            partition="persist:stringer" // Ensure persistence
            allowpopups="true"
        />
    </div>
  )
}
