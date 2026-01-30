import React from 'react';
import { Plus, X, Server } from 'lucide-react';
import type {StoredServer} from '@shared/types/database';

interface ConnectionModalProps {
  onClose: () => void;
  onConnect: (server: StoredServer) => void;
  editServer?: StoredServer;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({ onClose, onConnect, editServer }) => {
  const [storedServers, setStoredServers] = React.useState<StoredServer[]>([]);
  const [showAddForm, setShowAddForm] = React.useState(!!editServer);
  const [formData, setFormData] = React.useState({
    name: editServer?.name || '',
    type: editServer?.type || 'mysql' as 'mysql' | 'postgres' | 'sqlite',
    host: editServer?.config.host || 'localhost',
    port: editServer?.config.port || 3306,
    user: editServer?.config.user || 'root',
    password: editServer?.config.password || '',
    defaultFilter: editServer?.config.defaultFilter || 'mysql,information_schema,performance_schema,sys'
  });

  React.useEffect(() => {
    if (!editServer) {
      fetchStoredServers();
    }
  }, [editServer]);

  const fetchStoredServers = async () => {
    const res = await fetch('http://localhost:3001/api/stored-servers');
    const data = await res.json();
    setStoredServers(data);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editServer 
        ? `http://localhost:3001/api/stored-servers/${editServer.id}`
        : 'http://localhost:3001/api/stored-servers';
      
      const response = await fetch(url, {
        method: editServer ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          config: {
            host: formData.host,
            port: formData.port,
            user: formData.user,
            password: formData.password,
            defaultFilter: formData.defaultFilter
          }
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save connection');
      }

      if (editServer) {
        onClose();
      } else {
        setShowAddForm(false);
        fetchStoredServers();
      }
    } catch (error: any) {
      console.error('Error saving connection:', error);
      alert('Error saving connection: ' + error.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
          <h2 className="text-lg font-semibold text-slate-100">Saved Connections</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!showAddForm ? (
            <>
              {storedServers.length === 0 ? (
                <div className="text-center py-8 text-slate-500 italic">
                  No connections saved yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {storedServers.map(server => (
                    <div 
                      key={server.id}
                      className="flex items-center justify-between p-3 bg-slate-800 rounded border border-slate-700 hover:border-blue-500 cursor-pointer group"
                      onClick={() => onConnect(server)}
                    >
                      <div className="flex items-center gap-3">
                        <Server size={18} className="text-emerald-400" />
                        <div>
                          <div className="font-medium text-slate-200">{server.name}</div>
                          <div className="text-xs text-slate-500">{server.type} - {server.config.host}:{server.config.port}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button 
                onClick={() => setShowAddForm(true)}
                className="w-full py-2 border border-dashed border-slate-600 rounded flex items-center justify-center gap-2 text-slate-400 hover:text-slate-100 hover:border-slate-400"
              >
                <Plus size={18} />
                <span>Add New Connection</span>
              </button>
            </>
          ) : (
            <form onSubmit={handleSave} className="space-y-4 text-sm">
              <div className="space-y-2">
                <label className="text-slate-400 block">Name</label>
                <input 
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-slate-400 block">Type</label>
                  <select 
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value as any})}
                  >
                    <option value="mysql">MySQL</option>
                    <option value="postgres">PostgreSQL</option>
                    <option value="sqlite">SQLite</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-slate-400 block">Host</label>
                  <input 
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500" 
                    value={formData.host}
                    onChange={e => setFormData({...formData, host: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-slate-400 block">Port</label>
                  <input 
                    type="number"
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500" 
                    value={formData.port}
                    onChange={e => setFormData({...formData, port: parseInt(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-slate-400 block">User</label>
                  <input 
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500" 
                    value={formData.user}
                    onChange={e => setFormData({...formData, user: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-slate-400 block">Password</label>
                <input 
                  type="password"
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500" 
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-slate-400 block">Default Database Filter (comma separated)</label>
                <input 
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs" 
                  placeholder="mysql, information_schema, performance_schema, sys"
                  value={formData.defaultFilter}
                  onChange={e => setFormData({...formData, defaultFilter: e.target.value})}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button 
                  type="button"
                  onClick={() => {
                    if (editServer) {
                      onClose();
                    } else {
                      setShowAddForm(false);
                    }
                  }}
                  className="flex-1 py-2 bg-slate-700 text-slate-200 rounded hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 text-white rounded hover:bg-blue-500"
                >
                  Save Connection
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
