import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import type { SortConfig, TableDataResponse } from '@shared/types/database';

const DataRow = React.memo(({ row, columns, formatCellValue }: { 
  row: any, 
  columns: string[], 
  formatCellValue: (val: any) => any 
}) => (
  <tr className="hover:bg-slate-800/40 border-b border-slate-800/50 last:border-0">
    {columns.map(col => (
      <td 
        key={col} 
        className="px-4 py-1.5 text-sm text-slate-300 truncate border-r border-slate-800/30 last:border-r-0"
      >
        {formatCellValue(row[col])}
      </td>
    ))}
  </tr>
));

interface DataTableProps {
  serverId: string;
  database: string;
  table: string;
}

interface FilterInputProps {
  initialValue: string;
  onApply: (value: string) => void;
  isLoading?: boolean;
}

const FilterInput = React.memo(({ initialValue, onApply, isLoading }: FilterInputProps) => {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return (
    <div className="relative">
      <input 
        type="text" 
        placeholder="Filter data..." 
        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onApply(value);
          }
        }}
        disabled={isLoading}
      />
    </div>
  );
});

export const DataTable: React.FC<DataTableProps> = ({ serverId, database, table }) => {
  const [data, setData] = useState<TableDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortConfig[]>([]);
  const [appliedFilter, setAppliedFilter] = useState('');
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizingColumn, setResizingColumn] = useState<{ 
    name: string; 
    startX: number; 
    startWidth: number;
    otherColumnsTotalWidth: number;
  } | null>(null);
  const tableRef = React.useRef<HTMLTableElement>(null);
  const colRefs = React.useRef<Record<string, HTMLTableColElement | null>>({});
  const limit = 1000;

  useEffect(() => {
    setPage(0);
    setSort([]);
    setAppliedFilter('');
    setColumnWidths({});
  }, [serverId, database, table]);

  useEffect(() => {
    if (resizingColumn) {
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
  }, [resizingColumn]);

  const handleMouseDown = (e: React.MouseEvent, column: string) => {
    e.preventDefault();
    e.stopPropagation();
    const currentWidth = columnWidths[column] || 150;
    
    const otherColumnsTotalWidth = data?.columns.reduce((acc, col) => {
      if (col === column) return acc;
      return acc + (columnWidths[col] || 150);
    }, 0) || 0;

    setResizingColumn({
      name: column,
      startX: e.clientX,
      startWidth: currentWidth,
      otherColumnsTotalWidth
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingColumn) return;
    const diff = e.clientX - resizingColumn.startX;
    const newWidth = Math.max(50, resizingColumn.startWidth + diff);
    
    // Update COL element directly for performance
    const colEl = colRefs.current[resizingColumn.name];
    if (colEl) {
      colEl.style.width = `${newWidth}px`;
    }

    // Update table width directly to maintain horizontal scroll
    if (tableRef.current) {
      const newTotalWidth = resizingColumn.otherColumnsTotalWidth + newWidth;
      tableRef.current.style.width = `${newTotalWidth}px`;
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (resizingColumn) {
      const diff = e.clientX - resizingColumn.startX;
      const newWidth = Math.max(50, resizingColumn.startWidth + diff);
      setColumnWidths(prev => ({
        ...prev,
        [resizingColumn.name]: newWidth
      }));
    }
    setResizingColumn(null);
  };

  useEffect(() => {
    fetchData();
  }, [serverId, database, table, page, sort, appliedFilter]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const sortParam = sort.length > 0 ? `&sort=${encodeURIComponent(JSON.stringify(sort))}` : '';
      const filterParam = appliedFilter ? `&filter=${encodeURIComponent(appliedFilter)}` : '';
      const res = await fetch(`http://localhost:3001/api/servers/${serverId}/databases/${database}/tables/${table}/data?limit=${limit}&offset=${page * limit}${sortParam}${filterParam}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to fetch data');
      }
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column: string) => {
    setSort(prev => {
      const existing = prev.find(s => s.column === column);
      if (!existing) {
        return [...prev, { column, direction: 'DESC' }];
      }
      if (existing.direction === 'DESC') {
        return prev.map(s => s.column === column ? { ...s, direction: 'ASC' } : s);
      }
      return prev.filter(s => s.column !== column);
    });
  };

  const getSortIcon = (column: string) => {
    const s = sort.find(item => item.column === column);
    if (!s) return null;
    const index = sort.indexOf(s) + 1;
    return (
      <div className="flex items-center gap-0.5 ml-1">
        {s.direction === 'DESC' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
        {sort.length > 1 && <span className="text-[10px] bg-blue-600 rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">{index}</span>}
      </div>
    );
  };

  const handleApplyFilter = useCallback((val: string) => {
    setPage(0);
    setAppliedFilter(val);
  }, []);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400 p-8">
        <div className="text-center">
          <p className="text-xl font-bold mb-2">Error</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 0;
  const totalWidth = data?.columns.reduce((acc, col) => acc + (columnWidths[col] || 150), 0) || 0;

  const formatCellValue = (val: any) => {
    if (val === null) return <span className="text-slate-600 italic text-xs">NULL</span>;
    
    // Detect ISO date strings and format them
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
      return val.replace('T', ' ').replace(/\.\d+Z$/, '').replace('Z', '');
    }
    
    return String(val);
  };

  return (
    <div className={`flex-1 flex flex-col min-h-0 w-full min-w-0 relative ${resizingColumn ? 'cursor-col-resize select-none' : ''}`}>
      {loading && (
        <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center z-10 rounded-lg">
          <Loader2 className="animate-spin text-blue-500" size={48} />
        </div>
      )}

      {/* Pagination Bar */}
      <div className="flex items-center justify-between p-2 bg-slate-800/50 border-b border-slate-700 rounded-t-lg min-h-[48px]">
        {/* Left Side: Filter */}
        <div className="flex items-center gap-2 px-1">
          <FilterInput initialValue={appliedFilter} onApply={handleApplyFilter} isLoading={loading} />
        </div>

        {/* Right Side: Consolidated Row Info + Pagination */}
        <div className="flex items-center gap-4">
          <div className="text-xs text-slate-400">
            {data ? (
              <>
                Showing <span className="text-slate-200 font-medium">{page * limit + 1} - {Math.min((page + 1) * limit, data.total)}</span> of <span className="text-slate-200 font-medium">{data.total}</span> rows
              </>
            ) : 'Loading...'}
          </div>
          <div className="flex items-center gap-1 border-l border-slate-700 pl-4">
            <button 
              disabled={page === 0 || loading}
              onClick={() => setPage(0)}
              className="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronsLeft size={18} />
            </button>
            <button 
              disabled={page === 0 || loading}
              onClick={() => setPage(p => p - 1)}
              className="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm px-2">Page {page + 1} of {totalPages || 1}</span>
            <button 
              disabled={page >= totalPages - 1 || loading}
              onClick={() => setPage(p => p + 1)}
              className="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={18} />
            </button>
            <button 
              disabled={page >= totalPages - 1 || loading}
              onClick={() => setPage(totalPages - 1)}
              className="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronsRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 overflow-auto bg-slate-900 rounded-b-lg scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        <table 
          ref={tableRef}
          className="text-left border-collapse table-fixed w-full"
          style={{ width: totalWidth ? `${totalWidth}px` : '100%', minWidth: '100%' }}
        >
          <colgroup>
            {data?.columns.map(col => (
              <col 
                key={col} 
                style={{ width: columnWidths[col] || 150 }} 
                ref={el => { colRefs.current[col] = el; }}
              />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-20 bg-slate-800 shadow-sm">
            <tr>
              {data?.columns.map(col => (
                <th 
                  key={col}
                  className="relative px-4 py-2 border-b border-slate-700 text-sm font-semibold text-slate-200 group/header"
                >
                  <div 
                    className="flex items-center cursor-pointer hover:text-white select-none"
                    onClick={() => handleSort(col)}
                  >
                    <span className="truncate">{col}</span>
                    {getSortIcon(col)}
                  </div>
                  
                  {/* Resize Handle */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, col)}
                    className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 z-10 ${resizingColumn?.name === col ? 'bg-blue-500' : 'bg-transparent group-hover/header:bg-slate-600'}`}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((row, i) => (
              <DataRow 
                key={i} 
                row={row} 
                columns={data.columns} 
                formatCellValue={formatCellValue} 
              />
            ))}
            {data && data.rows.length === 0 && (
              <tr>
                <td colSpan={data.columns.length} className="px-4 py-8 text-center text-slate-500 italic">
                  No data found in this table.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
