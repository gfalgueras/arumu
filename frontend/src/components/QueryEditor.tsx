import React, { useState } from 'react';
import { Play, Loader2, AlertCircle, Database as DatabaseIcon } from 'lucide-react';

interface QueryEditorProps {
  serverId: string;
  database: string | null;
}

export const QueryEditor: React.FC<QueryEditorProps> = ({ serverId, database }) => {
  const [query, setQuery] = useState('SELECT * FROM ... LIMIT 100;');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExecute = async () => {
    if (!serverId) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`http://localhost:3001/api/servers/${serverId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sql: query,
          database: database || undefined 
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to execute query');
      }

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-4 bg-slate-900/50 p-2 border border-slate-700 rounded-lg">
        <button
          onClick={handleExecute}
          disabled={loading || !serverId}
          className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white rounded transition-colors font-medium text-sm"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          <span>Execute</span>
        </button>
        <div className="flex items-center gap-2 text-slate-400 text-sm border-l border-slate-700 pl-4">
          <DatabaseIcon size={14} />
          <span>{database || 'No database selected'}</span>
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex flex-col min-h-0 gap-4">
        <div className="flex-1 h-1/2 min-h-[150px]">
          <textarea
            className="w-full h-full bg-slate-900 text-slate-100 p-4 font-mono text-sm border border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
        </div>

        {/* Results Area */}
        <div className="flex-1 h-1/2 min-h-0 flex flex-col border border-slate-700 rounded-lg bg-slate-900 overflow-hidden">
          {error && (
            <div className="p-4 flex items-start gap-3 text-red-400 bg-red-400/10">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Query Error</p>
                <p className="text-sm font-mono whitespace-pre-wrap">{error}</p>
              </div>
            </div>
          )}

          {result && (
            <div className="flex-1 flex flex-col min-h-0">
               {Array.isArray(result) ? (
                 <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                   {result.length > 0 ? (
                     <table className="w-full text-left border-collapse min-w-max">
                       <thead className="sticky top-0 z-20 bg-slate-800 shadow-sm">
                         <tr>
                           {Object.keys(result[0]).map(col => (
                             <th key={col} className="px-4 py-2 border-b border-slate-700 text-sm font-semibold text-slate-200">
                               {col}
                             </th>
                           ))}
                         </tr>
                       </thead>
                       <tbody>
                         {result.map((row: any, i: number) => (
                           <tr key={i} className="hover:bg-slate-800/50 border-b border-slate-800/50 last:border-0 transition-colors">
                             {Object.keys(row).map(col => (
                               <td key={col} className="px-4 py-1.5 text-sm text-slate-300 truncate max-w-xs border-r border-slate-800/30 last:border-r-0">
                                 {row[col] === null ? <span className="text-slate-600 italic text-xs">NULL</span> : String(row[col])}
                               </td>
                             ))}
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   ) : (
                     <div className="p-8 text-center text-slate-500 italic">Query returned no results.</div>
                   )}
                 </div>
               ) : (
                 <div className="p-4 overflow-auto font-mono text-sm text-blue-300">
                    <pre>{JSON.stringify(result, null, 2)}</pre>
                 </div>
               )}
            </div>
          )}

          {!result && !error && !loading && (
            <div className="flex-1 flex items-center justify-center text-slate-600 italic text-sm">
              Execute a query to see results here
            </div>
          )}

          {loading && (
             <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
               <Loader2 className="animate-spin text-blue-500" size={32} />
               <span>Executing query...</span>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};
