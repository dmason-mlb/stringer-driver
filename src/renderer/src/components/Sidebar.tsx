import React, { useState } from 'react'
import { useAutomation } from '../context/AutomationContext'
import { runInitialSetup } from '../automations/initialSetup'
import { performStrikeout, performStrikeoutsToEndInning, performHit, performOut, performWalk } from '../automations/gameEvents'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import mlbLogo from '../assets/mlb-logo.svg'

type View = 'main' | 'advance' | 'individual';

export const Sidebar = () => {
  const { service } = useAutomation();
  const [currentView, setCurrentView] = useState<View>('main');
  const [direction, setDirection] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const navigate = (newView: View, newDirection: number) => {
    setDirection(newDirection);
    setCurrentView(newView);
  };

  const handleInitialSetup = async () => {
    if (service) {
        await runInitialSetup(service);
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

  const handleGameAction = async (action: string) => {
    if (!service) {
      alert('Automation service not ready');
      return;
    }

    setIsLoading(true);
    try {
      switch (action) {
        case "Strikeout":
          await performStrikeout(service);
          break;
        case "Strikeouts to End Inning":
          await performStrikeoutsToEndInning(service);
          break;
        case "Walk":
          await performWalk(service);
          break;
        case "Single":
          await performHit(service, 'Single');
          break;
        case "Double":
          await performHit(service, 'Double');
          break;
        case "Triple":
          await performHit(service, 'Triple');
          break;
        case "Home Run":
          await performHit(service, 'Home Run');
          break;
        case "Fly Out":
          await performOut(service, 'Fly Out');
          break;
        case "Ground Out":
          await performOut(service, 'Ground Out');
          break;
        default:
          console.log(`Action: ${action} not implemented yet`);
      }
    } catch (error) {
      console.error('Action failed:', error);
      alert(`Action failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 300 : -300,
      opacity: 0
    })
  };

  const CommonHeader = ({ title, onBack }: { title: string, onBack?: () => void }) => (
    <div className="flex items-center space-x-2 mb-4">
      {onBack && (
        <button 
          onClick={onBack}
          className="p-1 hover:bg-gray-700 rounded-full transition-colors"
          disabled={isLoading}
        >
          <ChevronLeft size={20} />
        </button>
      )}
      <h2 className="text-sm font-semibold text-gray-400">{title}</h2>
    </div>
  );

  const MainView = () => (
    <div className="space-y-4">
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
          disabled={isLoading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors disabled:opacity-50"
        >
          Initial Setup
        </button>
        <button 
          onClick={() => navigate('advance', 1)}
          disabled={isLoading}
          className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors disabled:opacity-50"
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
  );

  const AdvanceGameView = () => (
    <div className="space-y-2">
      <CommonHeader title="Advance Game" onBack={() => navigate('main', -1)} />
      
      <button 
        onClick={() => navigate('individual', 1)}
        disabled={isLoading}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors disabled:opacity-50"
      >
        Individual Play
      </button>
      
      <button 
        disabled
        className="w-full bg-gray-700 text-gray-400 text-sm font-medium py-2 px-4 rounded cursor-not-allowed opacity-75"
      >
        Advance to Game State (Soon)
      </button>
    </div>
  );

  const IndividualPlayView = () => {
    const actions = [
      "Strikeout", "Strikeouts to End Inning", "Walk", "Single", "Double", 
      "Triple", "Home Run", "Fly Out", "Ground Out"
    ];

    return (
      <div className="space-y-2">
        <CommonHeader title="Individual Play" onBack={() => navigate('advance', -1)} />
        
        <div className="grid grid-cols-1 gap-2">
          {actions.map((action) => (
            <button 
              key={action}
              disabled={isLoading}
              className={`w-full text-white text-xs font-medium py-2 px-3 rounded transition-colors text-left ${
                isLoading 
                  ? 'bg-gray-700 opacity-50 cursor-not-allowed' 
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
              onClick={() => handleGameAction(action)}
            >
              {action}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-64 h-full bg-gray-800 text-white flex flex-col border-r border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-700 z-10 bg-gray-800 flex items-center gap-3">
        <img src={mlbLogo} alt="MLB Logo" className="h-8 w-auto" />
        <h1 className="text-xl font-bold">Stringer Driver</h1>
      </div>
      
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={currentView}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 }
            }}
            className="absolute inset-0 p-4 overflow-y-auto w-full h-full"
          >
            {currentView === 'main' && <MainView />}
            {currentView === 'advance' && <AdvanceGameView />}
            {currentView === 'individual' && <IndividualPlayView />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
