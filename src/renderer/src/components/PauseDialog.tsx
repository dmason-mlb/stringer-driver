import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play, X } from 'lucide-react';

interface PauseDialogProps {
  isOpen: boolean;
  onResume: () => void;
  onCancel: () => void;
}

export const PauseDialog: React.FC<PauseDialogProps> = ({
  isOpen,
  onResume,
  onCancel
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-80 p-6"
          >
            <div className="flex items-center justify-center mb-4">
              <div className="bg-yellow-600/20 p-3 rounded-full">
                <Pause size={32} className="text-yellow-500" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-white text-center mb-2">
              Automation Paused
            </h2>

            <p className="text-gray-400 text-sm text-center mb-6">
              The automation is paused and will resume from where it left off.
            </p>

            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors flex items-center justify-center gap-2"
              >
                <X size={16} />
                Cancel
              </button>
              <button
                onClick={onResume}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors flex items-center justify-center gap-2"
              >
                <Play size={16} />
                Resume
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
