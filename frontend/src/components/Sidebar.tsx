import React, { useState, useEffect, useRef } from 'react';
import { Database, Table, ChevronRight, ChevronDown, Search, Server, Loader2, Settings } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onConfig: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, onConfig }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div 
      ref={menuRef}
      className="fixed z-50 bg-slate-800 border border-slate-700 rounded shadow-xl py-1 w-48"
      style={{ left: x, top: y }}
    >
      <div 
        className="flex items-center gap-2 px-3 py-2 hover:bg-slate-700 cursor-pointer text-sm text-slate-200"
        onClick={(e) => {
          e.stopPropagation();
          onConfig();
          onClose();
        }}
      >
        <Settings size={14} className="text-slate-400" />
        <span>Configuración</span>
      </div>
    </div>
  );
};

const formatSize = (bytes?: number) => {
  if (bytes === undefined) return '';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

interface TableItemProps {
  name: string;
  size?: number;
  isSelected: boolean;
  onSelect: () => void;
}

const TableItem: React.FC<TableItemProps> = ({ name, size, isSelected, onSelect }) => (
  <div 
    className={`flex items-center gap-2 py-1 px-4 pl-12 hover:bg-slate-700 cursor-pointer text-sm ${isSelected ? 'bg-blue-600/30 text-blue-400' : 'text-slate-300'} overflow-hidden group`}
    onClick={(e) => {
      e.stopPropagation();
      onSelect();
    }}
  >
    <Table size={14} className={`flex-shrink-0 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`} />
    <span className="truncate flex-1">{name}</span>
    <span className="text-[10px] text-slate-500 group-hover:text-slate-300 flex-shrink-0">
      {formatSize(size)}
    </span>
  </div>
);

interface DatabaseItemProps {
  name: string;
  size?: number;
  tables: { name: string; size?: number }[];
  filterTable: string;
  isSelected: boolean;
  selectedTable: string | null;
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  onSelect: () => void;
  onSelectTable: (table: string) => void;
  onExpand: () => void;
  isLoading?: boolean;
}

const DatabaseItem: React.FC<DatabaseItemProps> = ({ 
  name, size, tables, filterTable, isSelected, selectedTable, isOpen, onToggle, onSelect, onSelectTable,
  onExpand, isLoading
}) => {
  useEffect(() => {
    if (isOpen && tables.length === 0 && !isLoading) {
      onExpand();
    }
  }, [isOpen]);

  const filteredTables = tables.filter(t => 
    t.name.toLowerCase().includes(filterTable.toLowerCase())
  );

  if (filterTable && filteredTables.length === 0 && tables.length > 0) return null;

  return (
    <div>
      <div 
        className={`flex items-center gap-2 py-1.5 px-8 hover:bg-slate-700 cursor-pointer ${isSelected ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'} overflow-hidden group`}
        onClick={(e) => {
          e.stopPropagation();
          if (!isOpen) onToggle(true);
          onSelect();
        }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div 
            className="flex-shrink-0 hover:bg-slate-600 rounded p-0.5 -m-0.5"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(!isOpen);
            }}
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
          <Database size={16} className={`flex-shrink-0 ${isSelected ? 'text-blue-400' : 'text-blue-400'}`} />
          <span className="text-sm font-medium truncate flex-1">{name}</span>
          <span className="text-[10px] text-slate-500 group-hover:text-slate-300 flex-shrink-0 mr-1">
            {formatSize(size)}
          </span>
        </div>
        {isLoading && <Loader2 size={14} className="animate-spin text-blue-500 flex-shrink-0" />}
      </div>
      {isOpen && (
        <div className="bg-slate-800/30">
          {filteredTables.map(table => (
            <TableItem 
              key={table.name} 
              name={table.name} 
              size={table.size}
              isSelected={selectedTable === table.name}
              onSelect={() => onSelectTable(table.name)}
            />
          ))}
          {!isLoading && filteredTables.length === 0 && tables.length > 0 && (
            <div className="pl-12 py-1 text-xs text-slate-500 italic">No tables found</div>
          )}
          {!isLoading && tables.length === 0 && (
            <div className="pl-12 py-1 text-xs text-slate-500 italic">No tables</div>
          )}
        </div>
      )}
    </div>
  );
};

interface ServerItemProps {
  id: string;
  name: string;
  type: string;
  databases: { name: string; size?: number; tables: { name: string; size?: number }[] }[];
  filterDatabase: string;
  filterTable: string;
  isSelected: boolean;
  selectedDatabase: string | null;
  selectedTable: string | null;
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  onSelect: () => void;
  onSelectDatabase: (db: string) => void;
  onSelectTable: (dbName: string, table: string) => void;
  onExpand: () => void;
  onExpandDatabase: (db: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  isLoading?: boolean;
  loadingDatabases?: string[];
  expandedDatabaseIds: string[];
  onToggleDatabase: (db: string, open: boolean) => void;
}

const ServerItem: React.FC<ServerItemProps> = ({ 
  id, name, databases, filterDatabase, filterTable, isSelected, 
  selectedDatabase, selectedTable, isOpen, onToggle, onSelect, onSelectDatabase, onSelectTable,
  onExpand, onExpandDatabase, onContextMenu, isLoading, loadingDatabases = [],
  expandedDatabaseIds, onToggleDatabase
}) => {
  useEffect(() => {
    if (isOpen && databases.length === 0 && !isLoading) {
      onExpand();
    }
  }, [isOpen]);

  const filteredDatabases = databases.filter(db => 
    db.name.toLowerCase().includes(filterDatabase.toLowerCase()) &&
    (filterTable === '' || db.tables.length === 0 || db.tables.some(t => t.name.toLowerCase().includes(filterTable.toLowerCase())))
  );

  if (filterDatabase && filteredDatabases.length === 0 && databases.length > 0) return null;

  return (
    <div>
      <div 
        className={`flex items-center gap-2 py-2 px-4 hover:bg-slate-700 cursor-pointer ${isSelected ? 'bg-blue-600/20 border-l-2 border-blue-500' : 'text-slate-200'} overflow-hidden`}
        onClick={(e) => {
          e.stopPropagation();
          if (!isOpen) onToggle(true);
          onSelect();
        }}
        onContextMenu={(e) => onContextMenu(e, id)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div 
            className="flex-shrink-0 hover:bg-slate-600 rounded p-0.5 -m-0.5"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(!isOpen);
            }}
          >
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
          <Server size={18} className={`flex-shrink-0 ${isSelected ? 'text-blue-400' : 'text-emerald-400'}`} />
          <span className="font-semibold truncate">{name}</span>
        </div>
        {isLoading && <Loader2 size={16} className="animate-spin text-blue-500 flex-shrink-0" />}
      </div>
      {isOpen && (
        <div className="">
          {filteredDatabases.map(db => (
            <DatabaseItem 
              key={db.name} 
              name={db.name} 
              size={db.size}
              tables={db.tables} 
              filterTable={filterTable}
              isSelected={selectedDatabase === db.name}
              selectedTable={selectedTable}
              isOpen={expandedDatabaseIds.includes(db.name)}
              onToggle={(open) => onToggleDatabase(db.name, open)}
              onSelect={() => onSelectDatabase(db.name)}
              onSelectTable={(table) => onSelectTable(db.name, table)}
              onExpand={() => onExpandDatabase(db.name)}
              isLoading={loadingDatabases.includes(db.name)}
            />
          ))}
          {!isLoading && filteredDatabases.length === 0 && databases.length > 0 && (
            <div className="pl-8 py-1 text-xs text-slate-500 italic">No databases found</div>
          )}
          {!isLoading && databases.length === 0 && isOpen && (
             <div className="pl-8 py-1 text-xs text-slate-500 italic">No databases</div>
          )}
        </div>
      )}
    </div>
  );
};

interface SidebarProps {
  servers: any[];
  selectedServerId: string | null;
  selectedDatabase: string | null;
  selectedTable: string | null;
  onSelectServer: (id: string) => void;
  onSelectDatabase: (serverId: string, db: string) => void;
  onSelectTable: (serverId: string, db: string, table: string) => void;
  onExpandServer: (serverId: string) => void;
  onExpandDatabase: (serverId: string, db: string) => void;
  onConfigServer: (serverId: string) => void;
  loadingServers: string[];
  loadingDatabases: string[]; // Esperado como "serverId:dbName"
  dbFilter: string;
  tableFilter: string;
  setDbFilter: (val: string) => void;
  setTableFilter: (val: string) => void;
  expandedServerIds: string[];
  setExpandedServerIds: React.Dispatch<React.SetStateAction<string[]>>;
  expandedDatabaseIds: string[];
  setExpandedDatabaseIds: React.Dispatch<React.SetStateAction<string[]>>;
  onResizeMouseDown?: (e: React.MouseEvent) => void;
  onOpenConnection?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  servers, selectedServerId, selectedDatabase, selectedTable,
  onSelectServer, onSelectDatabase, onSelectTable, onExpandServer, onExpandDatabase,
  onConfigServer, loadingServers, loadingDatabases, dbFilter, tableFilter, setDbFilter, setTableFilter,
  expandedServerIds, setExpandedServerIds, expandedDatabaseIds, setExpandedDatabaseIds,
  onResizeMouseDown, onOpenConnection
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, serverId: string } | null>(null);

  const handleToggleServer = (serverId: string, open: boolean) => {
    setExpandedServerIds(prev => 
      open ? [...prev, serverId] : prev.filter(id => id !== serverId)
    );
  };

  const handleToggleDatabase = (serverId: string, dbName: string, open: boolean) => {
    const key = `${serverId}:${dbName}`;
    setExpandedDatabaseIds(prev => 
      open ? [...prev, key] : prev.filter(k => k !== key)
    );
  };

  const handleContextMenu = (e: React.MouseEvent, serverId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, serverId });
  };

  return (
    <div 
      className="h-screen bg-slate-900 flex flex-col border-r border-slate-700 select-none relative overflow-x-hidden flex-shrink-0"
      style={{ width: 'var(--sidebar-width, 256px)' }}
    >
      <div className="p-4 space-y-3 border-b border-slate-700">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 text-slate-500" size={16} />
          <input 
            type="text" 
            placeholder="Search database..." 
            className="w-full bg-slate-800 text-slate-200 pl-8 pr-2 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={dbFilter}
            onChange={(e) => setDbFilter(e.target.value)}
          />
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 text-slate-500" size={16} />
          <input 
            type="text" 
            placeholder="Search table..." 
            className="w-full bg-slate-800 text-slate-200 pl-8 pr-2 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 flex flex-col">
        {servers.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4 space-y-4">
            <p className="text-sm text-slate-500 italic">No connections active</p>
            <button 
              onClick={onOpenConnection}
              className="w-full py-2 px-4 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded text-sm flex items-center justify-center gap-2 group"
            >
              <Server size={14} className="group-hover:scale-110" />
              <span>Open Connection</span>
            </button>
          </div>
        ) : (
          servers.map(server => (
            <ServerItem 
              key={server.id}
              id={server.id}
              name={server.name}
              type={server.type}
              databases={(server.databases || []).map((db: any) => ({
                name: db.name,
                size: db.size,
                tables: (db.tables || []).map((t: any) => ({
                  name: t.name,
                  size: t.size
                }))
              }))}
              filterDatabase={dbFilter}
              filterTable={tableFilter}
              isSelected={selectedServerId === server.id}
              selectedDatabase={selectedServerId === server.id ? selectedDatabase : null}
              selectedTable={selectedServerId === server.id ? selectedTable : null}
              isOpen={expandedServerIds.includes(server.id)}
              onToggle={(open) => handleToggleServer(server.id, open)}
              onSelect={() => onSelectServer(server.id)}
              onSelectDatabase={(db) => onSelectDatabase(server.id, db)}
              onSelectTable={(dbName, table) => onSelectTable(server.id, dbName, table)}
              onExpand={() => onExpandServer(server.id)}
              onExpandDatabase={(db) => onExpandDatabase(server.id, db)}
              onContextMenu={handleContextMenu}
              isLoading={loadingServers.includes(server.id)}
              loadingDatabases={loadingDatabases
                .filter(ld => ld.startsWith(`${server.id}:`))
                .map(ld => ld.split(':')[1] || '')
              }
              expandedDatabaseIds={expandedDatabaseIds
                .filter(ed => ed.startsWith(`${server.id}:`))
                .map(ed => ed.split(':')[1] || '')
              }
              onToggleDatabase={(db, open) => handleToggleDatabase(server.id, db, open)}
            />
          ))
        )}
      </div>
      
      {contextMenu && (
        <ContextMenu 
          x={contextMenu.x} 
          y={contextMenu.y} 
          onClose={() => setContextMenu(null)}
          onConfig={() => onConfigServer(contextMenu.serverId)}
        />
      )}
      
      <div className="p-4 bg-slate-950 text-xs text-slate-500 border-t border-slate-800">
        SQL Manager v1.0.0
      </div>

      {/* Resize Handle */}
      <div 
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 z-10"
        onMouseDown={onResizeMouseDown}
      />
    </div>
  );
};
