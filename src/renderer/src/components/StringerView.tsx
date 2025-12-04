import React, { useEffect, useRef } from 'react'

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

interface StringerViewProps {
  isActive: boolean;
  partition: string;
  onMount: (webview: Electron.WebviewTag) => void;
}

export const StringerView = ({ isActive, partition, onMount }: StringerViewProps) => {
  const webviewRef = useRef<Electron.WebviewTag | null>(null);

  useEffect(() => {
    const webview = webviewRef.current;
    if (webview) {
      onMount(webview);
      webview.addEventListener('dom-ready', () => {
        console.log(`Stringer view loaded (partition: ${partition})`);
      });
    }
  }, [onMount, partition]);

  return (
    <div className={`flex-1 h-full bg-white relative ${isActive ? 'block' : 'hidden'}`}>
        <webview
            ref={webviewRef as any}
            src="https://stringer-qa.bdatasf.mlbinfra.com/client/index.html"
            className="w-full h-full"
            partition={partition}
            allowpopups="true"
        />
    </div>
  )
}
