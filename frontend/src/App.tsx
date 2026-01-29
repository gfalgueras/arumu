import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ConnectionModal } from './components/ConnectionModal';
import { DataTable } from './components/DataTable';
import { QueryEditor } from './components/QueryEditor';
import type {ServerInfo, StoredServer} from '@shared/types/database';

function App() {
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'data' | 'query'>('query');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<StoredServer | null>(null);
  const [loadingServers, setLoadingServers] = useState<string[]>([]);
  const [loadingDatabases, setLoadingDatabases] = useState<string[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(256); // Default in px
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    fetchServers();
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing) return;
    
    let newWidth = e.clientX;
    const minWidth = window.innerWidth * 0.05;
    const maxWidth = window.innerWidth * 0.20;
    
    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;
    
    setSidebarWidth(newWidth);
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  const fetchServers = async () => {
    const res = await fetch('http://localhost:3001/api/servers');
    const data = await res.json();
    setServers(data);
  };

  const handleExpandServer = async (serverId: string) => {
    if (loadingServers.includes(serverId)) return;
    
    setLoadingServers(prev => [...prev, serverId]);
    try {
      const res = await fetch(`http://localhost:3001/api/servers/${serverId}/databases`);
      const databases = await res.json();
      
      setServers(prev => prev.map(s => 
        s.id === serverId ? { ...s, databases } : s
      ));
    } catch (error) {
      console.error('Error fetching databases:', error);
    } finally {
      setLoadingServers(prev => prev.filter(id => id !== serverId));
    }
  };

  const handleExpandDatabase = async (serverId: string, dbName: string) => {
    const key = `${serverId}:${dbName}`;
    if (loadingDatabases.includes(key)) return;

    setLoadingDatabases(prev => [...prev, key]);
    try {
      const res = await fetch(`http://localhost:3001/api/servers/${serverId}/databases/${dbName}/tables`);
      const tables = await res.json(); // Ahora es una lista de objetos {name, size}

      setServers(prev => prev.map(s => {
        if (s.id === serverId) {
          const updatedDbs = s.databases?.map(db => 
            db.name === dbName ? { 
              ...db, 
              tables, 
              size: tables.reduce((acc: number, t: any) => acc + (t.size || 0), 0) 
            } : db
          );
          return { ...s, databases: updatedDbs };
        }
        return s;
      }));
    } catch (error) {
      console.error('Error fetching tables:', error);
    } finally {
      setLoadingDatabases(prev => prev.filter(k => k !== key));
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingServer(null);
  };

  const handleConnect = async (storedServer: StoredServer) => {
    const res = await fetch('http://localhost:3001/api/servers/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(storedServer),
    });
    if (res.ok) {
      await fetchServers();
      handleCloseModal();
    }
  };

  const handleCloseConnection = async () => {
    if (!selectedServerId) return;
    try {
      const res = await fetch(`http://localhost:3001/api/servers/${selectedServerId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        // Actualizamos localmente para una respuesta inmediata en la UI
        setServers(prev => prev.filter(s => s.id !== selectedServerId));
        setSelectedServerId(null);
        setSelectedDatabase(null);
        setSelectedTable(null);
      } else {
        const errorData = await res.json();
        alert('Error closing connection: ' + (errorData.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error closing connection:', error);
      alert('Error closing connection: ' + error.message);
    }
  };

  const handleConfigServer = async (serverId: string) => {
    try {
      const res = await fetch('http://localhost:3001/api/stored-servers');
      const storedServers: StoredServer[] = await res.json();
      const serverToEdit = storedServers.find(s => s.id === serverId);
      if (serverToEdit) {
        setEditingServer(serverToEdit);
        setIsModalOpen(true);
      } else {
        alert('No se pudo encontrar la configuración guardada para este servidor.');
      }
    } catch (error) {
      console.error('Error fetching server config:', error);
    }
  };

  return (
    <div className={`flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
      <Sidebar 
        servers={servers}
        selectedServerId={selectedServerId}
        selectedDatabase={selectedDatabase}
        selectedTable={selectedTable}
        onSelectServer={(id) => {
          setSelectedServerId(id);
          setSelectedDatabase(null);
          setSelectedTable(null);
          setActiveTab('query');
        }}
        onSelectDatabase={(serverId, db) => {
          setSelectedServerId(serverId);
          setSelectedDatabase(db);
          setSelectedTable(null);
          setActiveTab('query');
        }}
        onSelectTable={(serverId, db, table) => {
          setSelectedServerId(serverId);
          setSelectedDatabase(db);
          setSelectedTable(table);
          setActiveTab('data');
        }}
        onExpandServer={handleExpandServer}
        onExpandDatabase={handleExpandDatabase}
        onConfigServer={handleConfigServer}
        loadingServers={loadingServers}
        loadingDatabases={loadingDatabases}
        width={sidebarWidth}
        onResizeMouseDown={handleMouseDown}
        onOpenConnection={() => setIsModalOpen(true)}
      />
      <div className="flex-1 flex flex-col">
        <TopBar 
          onOpenConnection={() => setIsModalOpen(true)}
          onCloseConnection={handleCloseConnection}
          canClose={!!selectedServerId}
        />
        <main className="flex-1 flex flex-col p-4 overflow-hidden min-w-0">
          {selectedServerId ? (
            <div className="w-full h-full flex flex-col min-h-0">
               {/* Tabs Header */}
               <div className="flex border-b border-slate-800 mb-4">
                 {selectedTable && (
                   <button 
                    onClick={() => setActiveTab('data')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'data' ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                   >
                     Datos
                   </button>
                 )}
                 <button 
                  onClick={() => setActiveTab('query')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'query' ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                 >
                   Query
                 </button>
               </div>

               {/* Tab Content */}
               <div className="flex-1 min-h-0 flex flex-col">
                 {activeTab === 'data' && selectedTable && selectedServerId && selectedDatabase && (
                    <DataTable 
                      serverId={selectedServerId}
                      database={selectedDatabase}
                      table={selectedTable}
                    />
                 )}
                 {activeTab === 'query' && (
                    <QueryEditor 
                      serverId={selectedServerId}
                      database={selectedDatabase}
                    />
                 )}
               </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="max-w-2xl text-center space-y-4">
                <h1 className="text-4xl font-bold text-blue-500">SQL Manager</h1>
                <p className="text-slate-400 text-lg">
                  Select a server, database and table from the sidebar to start managing your data.
                </p>
                <div className="grid grid-cols-2 gap-4 mt-8 mx-auto">
                  <div className="p-6 bg-slate-900 rounded-lg border border-slate-800 text-left">
                    <h3 className="font-semibold text-blue-400 mb-2">Modular Backend</h3>
                    <p className="text-sm text-slate-500">Ready for MySQL, PostgreSQL, and SQLite.</p>
                  </div>
                  <div className="p-6 bg-slate-900 rounded-lg border border-slate-800 text-left">
                    <h3 className="font-semibold text-blue-400 mb-2">Modern UI</h3>
                    <p className="text-sm text-slate-500">Built with React, Tailwind CSS and Lucide icons.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {isModalOpen && (
        <ConnectionModal 
          onClose={handleCloseModal}
          onConnect={handleConnect}
          editServer={editingServer || undefined}
        />
      )}
    </div>
  )
}

export default App
