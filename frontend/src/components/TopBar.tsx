import React from 'react';
import { Power, PowerOff } from 'lucide-react';

interface TopBarProps {
  onOpenConnection: () => void;
  onCloseConnection: () => void;
  canClose: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenConnection, onCloseConnection, canClose }) => {
  return (
    <div className="h-10 bg-slate-900 border-b border-slate-700 flex items-center px-4 gap-2">
      <button 
        onClick={onOpenConnection}
        className="p-1.5 hover:bg-slate-800 rounded text-emerald-400"
        title="Open Connection"
      >
        <Power size={18} />
      </button>
      <button 
        onClick={onCloseConnection}
        disabled={!canClose}
        className={`p-1.5 rounded ${canClose ? 'hover:bg-slate-800 text-red-400' : 'text-slate-600 cursor-not-allowed'}`}
        title="Close Connection"
      >
        <PowerOff size={18} />
      </button>
      <div className="h-4 w-px bg-slate-700 mx-2" />
    </div>
  );
};
