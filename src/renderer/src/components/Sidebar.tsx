import React from 'react'
import { useAutomation } from '../context/AutomationContext'
import { runInitialSetup } from '../automations/initialSetup'
import { advanceGame } from '../automations/advanceGame'

export const Sidebar = () => {
  const { service } = useAutomation();

  const handleInitialSetup = async () => {
    if (service) {
        await runInitialSetup(service);
    } else {
        alert('Automation service not ready');
    }
  };

  const handleAdvanceGame = async () => {
    if (service) {
        await advanceGame(service);
    } else {
        alert('Automation service not ready');
    }
  };

  const handleInspectApp = () => {
    if (service) {
        service.openDevTools();
    } else {
        alert('Automation service not ready');
    }
  };

  return (
    <div className="w-64 h-full bg-gray-800 text-white flex flex-col border-r border-gray-700">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">Stringer Driver</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-gray-900 rounded p-3">
          <h2 className="text-sm font-semibold text-gray-400 mb-2">Status</h2>
          <div className="text-xs">{service ? 'Connected' : 'Disconnected'}</div>
        </div>
        
        <div className="bg-yellow-900/50 border border-yellow-700/50 rounded p-3">
          <div className="flex items-start space-x-2">
            <span className="text-yellow-500 text-lg">⚠️</span>
            <div className="text-xs text-yellow-200">
              <p className="mb-2">
                Please notify the <span className="font-bold text-yellow-100">#qa-stringing</span> channel of the game you intend to string.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400">Automation</h2>
          <button 
            onClick={handleInitialSetup}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
          >
            Initial Setup
          </button>
          <button 
            onClick={handleAdvanceGame}
            className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
          >
            Advance Game
          </button>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400">Debug</h2>
          <button 
            onClick={handleInspectApp}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
          >
            Inspect App Element
          </button>
        </div>
      </div>
    </div>
  )
}
