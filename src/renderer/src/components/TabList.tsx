import React, { useState, useRef, useEffect } from 'react';
import { Reorder, motion, AnimatePresence } from 'framer-motion';
import { X, Plus } from 'lucide-react';

export interface Tab {
  id: string;
  name: string;
  partition: string;
}

interface TabListProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabReorder: (tabs: Tab[]) => void;
  onTabRename: (id: string, newName: string) => void;
  onNewTab: () => void;
}

export const TabList = ({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabReorder,
  onTabRename,
  onNewTab,
}: TabListProps) => {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
  } | null>(null);

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleRenameStart = (tab: Tab) => {
    setEditingTabId(tab.id);
    setEditingName(tab.name);
    setContextMenu(null);
  };

  const handleRenameSubmit = () => {
    if (editingTabId) {
      onTabRename(editingTabId, editingName);
      setEditingTabId(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  return (
    <div className="flex items-center bg-gray-900 h-10 border-b border-gray-700 select-none">
      <Reorder.Group
        axis="x"
        values={tabs}
        onReorder={onTabReorder}
        className="flex h-full overflow-x-auto no-scrollbar"
      >
        <AnimatePresence initial={false}>
          {tabs.map((tab) => (
            <Reorder.Item
              key={tab.id}
              value={tab}
              className={`flex items-center h-full min-w-[150px] max-w-[200px] border-r border-gray-800 cursor-pointer group relative ${
                tab.id === activeTabId
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
              onPointerDown={() => onTabClick(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
            >
              <div className="flex items-center w-full px-3 py-1">
                {editingTabId === tab.id ? (
                  <input
                    ref={editInputRef}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={handleRenameSubmit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSubmit();
                      if (e.key === 'Escape') setEditingTabId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-gray-700 text-white px-1 py-0.5 rounded text-xs outline-none border border-blue-500"
                    maxLength={60}
                  />
                ) : (
                  <span
                    className="truncate text-xs flex-1"
                    onDoubleClick={() => handleRenameStart(tab)}
                  >
                    {tab.name}
                  </span>
                )}
                
                <motion.button
                  whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.1)' }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(tab.id);
                  }}
                  className={`ml-2 p-0.5 rounded-full ${
                    tab.id === activeTabId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <X size={12} />
                </motion.button>
              </div>
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>

      <button
        onClick={onNewTab}
        className="h-full px-3 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        title="New Game"
      >
        <Plus size={16} />
      </button>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-gray-800 border border-gray-700 rounded shadow-lg py-1 z-50 min-w-[120px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
            onClick={() => {
              const tab = tabs.find((t) => t.id === contextMenu.tabId);
              if (tab) handleRenameStart(tab);
            }}
          >
            Rename
          </button>
          <button
            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700"
            onClick={() => {
              onTabClose(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            Close Tab
          </button>
        </div>
      )}
    </div>
  );
};
