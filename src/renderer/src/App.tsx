import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Sidebar } from './components/Sidebar'
import { StringerView } from './components/StringerView'
import { TabList, Tab } from './components/TabList'
import { useAutomation } from './context/AutomationContext'

function App(): JSX.Element {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: '1', name: 'New Stringer Game', partition: 'persist:stringer-1' }
  ]);
  const [activeTabId, setActiveTabId] = useState('1');
  const webviewsRef = useRef<Record<string, Electron.WebviewTag>>({});
  const { setWebview } = useAutomation();

  // Update the automation context when the active tab changes
  useEffect(() => {
    const activeWebview = webviewsRef.current[activeTabId];
    if (activeWebview) {
      setWebview(activeWebview);
    }
  }, [activeTabId, setWebview]);

  const handleAddTab = async () => {
    const newId = String(Date.now());
    const newPartition = `persist:stringer-${newId}`;

    // Copy cookies from active tab if it exists
    if (tabs.length > 0) {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab) {
         try {
           // @ts-ignore (window.electron is exposed via preload)
           await window.electron.ipcRenderer.invoke('copy-cookies', activeTab.partition, newPartition);
         } catch (e) {
           console.error("Failed to copy cookies", e);
         }
      }
    }

    const newTab: Tab = {
      id: newId,
      name: 'New Stringer Game',
      partition: newPartition
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const handleCloseTab = (id: string) => {
    if (tabs.length === 1) return; // Don't close the last tab

    const tabIndex = tabs.findIndex(t => t.id === id);
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);

    // Clean up webview ref
    delete webviewsRef.current[id];

    // If closing active tab, switch to another
    if (id === activeTabId) {
      const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
      setActiveTabId(newTabs[newActiveIndex].id);
    }
  };

  const handleReorderTabs = (newTabs: Tab[]) => {
    setTabs(newTabs);
  };

  const handleRenameTab = (id: string, newName: string) => {
    setTabs(prev => prev.map(tab => 
      tab.id === id ? { ...tab, name: newName } : tab
    ));
  };

  const handleGameSetup = (name: string) => {
    handleRenameTab(activeTabId, name);
  };

  const handleWebviewMount = useCallback((id: string, webview: Electron.WebviewTag) => {
    webviewsRef.current[id] = webview;
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar onGameSetup={handleGameSetup} />
      
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <TabList
          tabs={tabs}
          activeTabId={activeTabId}
          onTabClick={setActiveTabId}
          onTabClose={handleCloseTab}
          onTabReorder={handleReorderTabs}
          onTabRename={handleRenameTab}
          onNewTab={handleAddTab}
        />
        
        <div className="flex-1 relative">
          {tabs.map(tab => (
            <StringerView
              key={tab.id}
              isActive={tab.id === activeTabId}
              partition={tab.partition}
              onMount={(webview) => handleWebviewMount(tab.id, webview)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
