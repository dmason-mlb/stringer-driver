import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface GameSimulationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSimulate: (homeScore: number, visitingScore: number) => void;
  currentHomeScore: number;
  currentVisitingScore: number;
  homeTeamName: string;
  visitingTeamName: string;
}

export const GameSimulationDialog: React.FC<GameSimulationDialogProps> = ({
  isOpen,
  onClose,
  onSimulate,
  currentHomeScore,
  currentVisitingScore,
  homeTeamName,
  visitingTeamName
}) => {
  const [homeScore, setHomeScore] = useState<string>('');
  const [visitingScore, setVisitingScore] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setHomeScore('');
      setVisitingScore('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = () => {
    const hScore = parseInt(homeScore, 10);
    const vScore = parseInt(visitingScore, 10);

    if (isNaN(hScore) || isNaN(vScore)) {
      setError('Please enter valid numeric scores.');
      return;
    }

    if (hScore === vScore) {
      setError('Scores cannot be tied in baseball.');
      return;
    }

    if (hScore < currentHomeScore) {
      setError(`Home score cannot be less than current score (${currentHomeScore}).`);
      return;
    }

    if (vScore < currentVisitingScore) {
      setError(`Visiting score cannot be less than current score (${currentVisitingScore}).`);
      return;
    }

    setError(null);
    onSimulate(hScore, vScore);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-96 p-6 relative"
          >
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-bold text-white mb-4">Simulate Game</h2>
            
            <div className="space-y-6">
              {/* Visiting Team (Top) */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  {visitingTeamName} (Visiting)
                </label>
                <div className="flex items-center gap-4">
                   <span className="text-xs text-gray-500 w-16">Current: {currentVisitingScore}</span>
                   <input
                    type="number"
                    value={visitingScore}
                    onChange={(e) => setVisitingScore(e.target.value)}
                    className="flex-1 bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500"
                    placeholder="Final Score"
                  />
                </div>
              </div>

              {/* Home Team (Bottom) */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  {homeTeamName} (Home)
                </label>
                <div className="flex items-center gap-4">
                   <span className="text-xs text-gray-500 w-16">Current: {currentHomeScore}</span>
                   <input
                    type="number"
                    value={homeScore}
                    onChange={(e) => setHomeScore(e.target.value)}
                    className="flex-1 bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500"
                    placeholder="Final Score"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-900/50 border border-red-700/50 text-red-200 text-sm p-3 rounded">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
                >
                  Sim to Final
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

