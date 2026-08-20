import { DatabaseSync, StatementSync, type SQLInputValue } from 'node:sqlite';
import { batchRows, buildValuesClause } from './bulk-insert';
import { parseFilter } from './filter';
import {
  IDatabaseDriver, ConnectionConfig, DatabaseInfo, TableInfo, TableDataResponse,
  SortConfig, ColumnInfo, TableIndex, ForeignKey, TypeGroup, ServerCapabilities, ServerVariablesResult, QueryResult
} from '@shared/types/database';

export class SQLiteDriver implements IDatabaseDriver {
  private db: DatabaseSync | null = null;

  static queryLogger: ((sql: string, durationMs: number, error?: string) => void) | null = null;

  private exec<T = Record<string, unknown>>(sql: string, params: SQLInputValue[] = []): T[] {
    if (!this.db) throw new Error('Not connected');
    const t0 = Date.now();
    try {
      const stmt: StatementSync = this.db.prepare(sql);
      const rows = stmt.all(...params);
      SQLiteDriver.queryLogger?.(sql, Date.now() - t0);
      return rows as T[];
    } catch (err: unknown) {
      SQLiteDriver.queryLogger?.(sql, Date.now() - t0, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  private run(sql: string, params: SQLInputValue[] = []): { changes: number | bigint; lastInsertRowid: number | bigint } {
    if (!this.db) throw new Error('Not connected');
    const t0 = Date.now();
    try {
      const result = this.db.prepare(sql).run(...params);
      SQLiteDriver.queryLogger?.(sql, Date.now() - t0);
      return result;
    } catch (err: unknown) {
      SQLiteDriver.queryLogger?.(sql, Date.now() - t0, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  escapeIdentifier(name: string): string {
    return '"' + name.replace(/"/g, '""') + '"';
  }

  escapeStringLiteral(val: string): string {
    return "'" + val.replace(/'/g, "''") + "'";
  }

  async connect(config: ConnectionConfig): Promise<void> {
    const filePath = config.filePath || config.host || ':memory:';
    this.db = new DatabaseSync(filePath);
    // Enable foreign key enforcement
    this.db.prepare('PRAGMA foreign_keys = ON').run();
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      try { this.db.close(); } catch { /* ignore */ }
      this.db = null;
    }
  }

  async beginTransaction(): Promise<void> {
    this.run('BEGIN');
  }

  async commit(): Promise<void> {
    this.run('COMMIT');
  }

  async rollback(): Promise<void> {
    this.run('ROLLBACK');
  }

  async getDatabases(): Promise<DatabaseInfo[]> {
    const rows = this.exec<{ name: string }>('PRAGMA database_list');
    return rows.map((r) => ({ name: r.name, tables: [] }));
  }

  async getTables(_database: string): Promise<TableInfo[]> {
    const rows = this.exec<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );
    return rows.map((r) => ({ name: r.name, size: 0 }));
  }

  async getSchema(_database: string): Promise<Record<string, string[]>> {
    const rows = this.exec<{ table_name: string; column_name: string }>(`
      SELECT m.name as table_name, p.name as column_name
      FROM sqlite_master m, pragma_table_info(m.name) p
      WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'
      ORDER BY m.name, p.cid
    `);
    const schema: Record<string, string[]> = {};
    for (const row of rows) {
      if (!schema[row.table_name]) schema[row.table_name] = [];
      schema[row.table_name].push(row.column_name);
    }
    return schema;
  }

  async getTableColumns(_database: string, table: string): Promise<ColumnInfo[]> {
    const esc = (n: string) => this.escapeIdentifier(n);
    interface PragmaColumnRow {
      name: string;
      type: string;
      notnull: number;
      pk: number;
      dflt_value: string | null;
    }
    const rows = this.exec<PragmaColumnRow>(`PRAGMA table_info(${esc(table)})`);
    return rows.map(row => {
      const fullType = row.type || '';
      const typeMatch = fullType.match(/^([a-z\s]+?)(?:\(([^)]+)\))?$/i);
      const type = typeMatch ? typeMatch[1].trim().toUpperCase() : fullType.toUpperCase() || 'TEXT';
      const length = typeMatch ? (typeMatch[2] || null) : null;
      return {
        name: row.name,
        type,
        length,
        nullable: row.notnull === 0,
        key: row.pk > 0 ? 'PRI' : '',
        default: row.dflt_value ?? null,
        extra: '',
        unsigned: false,
      };
    });
  }

  async getTableIndexes(_database: string, table: string): Promise<TableIndex[]> {
    const esc = (n: string) => this.escapeIdentifier(n);
    interface PragmaIndexRow { name: string; unique: number; origin: string }
    interface PragmaColumnRow { name: string; pk: number }
    interface PragmaIndexInfoRow { name: string }
    const indexes = this.exec<PragmaIndexRow>(`PRAGMA index_list(${esc(table)})`);

    // Detect single-column INTEGER PRIMARY KEY (rowid alias — has no explicit index)
    const cols = this.exec<PragmaColumnRow>(`PRAGMA table_info(${esc(table)})`);
    const pkCols = cols.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk);
    const result: TableIndex[] = [];

    if (pkCols.length > 0) {
      result.push({
        name: 'PRIMARY',
        columns: pkCols.map(c => c.name),
        unique: true,
        type: 'PRIMARY',
        method: 'BTREE',
      });
    }

    for (const idx of indexes) {
      // Skip auto-generated PK index (origin = 'pk')
      if (idx.origin === 'pk') continue;
      const info = this.exec<PragmaIndexInfoRow>(`PRAGMA index_info(${this.escapeIdentifier(idx.name)})`);
      result.push({
        name: idx.name,
        columns: info.map(i => i.name),
        unique: idx.unique === 1,
        type: idx.unique === 1 ? 'UNIQUE' : 'INDEX',
        method: 'BTREE',
      });
    }
    return result;
  }

  async getTableForeignKeys(_database: string, table: string): Promise<ForeignKey[]> {
    const esc = (n: string) => this.escapeIdentifier(n);
    interface PragmaFkRow {
      id: number;
      table: string;
      from: string;
      to: string | null;
      on_update: string;
      on_delete: string;
    }
    const rows = this.exec<PragmaFkRow>(`PRAGMA foreign_key_list(${esc(table)})`);
    const fkMap = new Map<number, ForeignKey>();
    for (const row of rows) {
      const id = row.id;
      if (!fkMap.has(id)) {
        fkMap.set(id, {
          name: `fk_${table}_${id}`,
          columns: [],
          referencedTable: row.table,
          referencedColumns: [],
          updateRule: row.on_update,
          deleteRule: row.on_delete,
        });
      }
      fkMap.get(id)!.columns.push(row.from);
      if (row.to) fkMap.get(id)!.referencedColumns.push(row.to);
    }
    return Array.from(fkMap.values());
  }

  async getTableCreateStatement(_database: string, table: string): Promise<string> {
    const rows = this.exec<{ sql: string }>(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
      [table]
    );
    return rows[0]?.sql ?? '';
  }

  async getTableData(_database: string, table: string, limit: number, offset: number, sort?: SortConfig[], filter?: string): Promise<TableDataResponse> {
    const esc = (n: string) => this.escapeIdentifier(n);

    const colRows = this.exec<{ name: string }>(`PRAGMA table_info(${esc(table)})`);
    const columns = colRows.map(r => r.name);

    const filterParams: SQLInputValue[] = [];
    let whereClause = '';

    if (filter && columns.length > 0) {
      const parsed = parseFilter(filter);
      if (parsed.isSearch) {
        const searchTerms = columns.map(col => `CAST(${esc(col)} AS TEXT) LIKE ?`).join(' OR ');
        whereClause = `WHERE ${searchTerms}`;
        columns.forEach(() => filterParams.push(`%${filter}%`));
      } else {
        whereClause = parsed.whereClause;
      }
    }

    let orderBy = '';
    if (sort && sort.length > 0) {
      orderBy = 'ORDER BY ' + sort.map(s => `${esc(s.column)} ${s.direction === 'DESC' ? 'DESC' : 'ASC'}`).join(', ');
    }

    const safeLimit = Math.max(1, Math.floor(Number(limit)));
    const safeOffset = Math.max(0, Math.floor(Number(offset)));

    const query = `SELECT * FROM ${esc(table)} ${whereClause} ${orderBy} LIMIT ? OFFSET ?`;
    const countQuery = `SELECT COUNT(*) as total FROM ${esc(table)} ${whereClause}`;

    const rows = this.exec(query, [...filterParams, safeLimit, safeOffset]);
    const countRows = this.exec<{ total: number }>(countQuery, filterParams);

    return {
      columns,
      rows,
      total: Number(countRows[0]?.total ?? 0),
    };
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    if (!this.db) throw new Error('Not connected');
    const trimmedUpper = sql.trim().toUpperCase();
    const isReader = /^(SELECT|WITH|EXPLAIN|PRAGMA\s+\w+\s*$|PRAGMA\s+\w+\s*\()/i.test(trimmedUpper);
    if (isReader) {
      return this.exec<Record<string, unknown>>(sql);
    }
    const result = this.run(sql);
    return { affectedRows: Number(result.changes) };
  }

  async addIndex(_database: string, table: string, index: TableIndex): Promise<void> {
    const esc = (n: string) => this.escapeIdentifier(n);
    if (index.type === 'PRIMARY') {
      throw new Error('SQLite does not support adding a PRIMARY KEY after table creation');
    }
    const cols = index.columns.map(esc).join(', ');
    const unique = index.type === 'UNIQUE' ? 'UNIQUE ' : '';
    const name = esc(index.name || `${table}_${index.columns.join('_')}_idx`);
    this.run(`CREATE ${unique}INDEX ${name} ON ${esc(table)} (${cols})`);
  }

  async addForeignKey(_database: string, _table: string, _fk: ForeignKey): Promise<void> {
    throw new Error('SQLite does not support adding foreign keys to existing tables');
  }

  async dropIndex(_database: string, _table: string, indexName: string): Promise<void> {
    if (indexName === 'PRIMARY') {
      throw new Error('SQLite does not support dropping the PRIMARY KEY constraint');
    }
    this.run(`DROP INDEX ${this.escapeIdentifier(indexName)}`);
  }

  async dropForeignKey(_database: string, _table: string, _fkName: string): Promise<void> {
    throw new Error('SQLite does not support dropping foreign keys from existing tables');
  }

  async addColumn(_database: string, table: string, column: ColumnInfo, _afterColumn?: string): Promise<void> {
    const esc = (n: string) => this.escapeIdentifier(n);
    let typePart = column.type;
    if (column.length) typePart += `(${column.length})`;
    let sql = `ALTER TABLE ${esc(table)} ADD COLUMN ${esc(column.name)} ${typePart}`;
    // SQLite: NOT NULL requires a DEFAULT value
    if (!column.nullable && column.default != null) {
      sql += ` NOT NULL DEFAULT ${this.escapeStringLiteral(String(column.default))}`;
    } else if (!column.nullable) {
      sql += ` NOT NULL DEFAULT ''`;
    }
    if (column.default != null && column.nullable) {
      sql += ` DEFAULT ${this.escapeStringLiteral(String(column.default))}`;
    }
    this.run(sql);
  }

  async updateColumn(_database: string, _table: string, _oldColumnName: string, _newColumn: ColumnInfo, _afterColumn?: string): Promise<void> {
    throw new Error('SQLite requires table recreation to modify columns. This operation is not supported yet.');
  }

  async insertRows(_database: string, table: string, columns: string[], rows: (string | null)[][]): Promise<number> {
    if (rows.length === 0 || columns.length === 0) return 0;
    const colList = columns.map(c => this.escapeIdentifier(c)).join(', ');

    for (const batch of batchRows(rows, columns.length)) {
      const values = buildValuesClause(batch.length, columns.length, () => '?');
      this.run(`INSERT INTO ${this.escapeIdentifier(table)} (${colList}) VALUES ${values}`, batch.flat());
    }
    return rows.length;
  }

  async getSupportedTypes(): Promise<TypeGroup[]> {
    return [
      { group: 'Entero', types: ['INTEGER', 'TINYINT', 'SMALLINT', 'MEDIUMINT', 'BIGINT'] },
      { group: 'Real', types: ['REAL', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC'] },
      { group: 'Texto', types: ['TEXT', 'CHAR', 'VARCHAR', 'NCHAR', 'NVARCHAR', 'CLOB'] },
      { group: 'Binario', types: ['BLOB'] },
      { group: 'Fecha', types: ['DATE', 'DATETIME', 'TIMESTAMP'] },
      { group: 'Booleano', types: ['BOOLEAN'] },
    ];
  }

  getCapabilities(): ServerCapabilities {
    return {
      supportsTransactionalDDL: true,
      supportsUnsigned: false,
      supportsVirtuality: false,
      supportsCollation: false,
      supportsColumnComment: false,
      supportsFullTextIndex: false,
      supportsSpatialIndex: false,
      supportsProcessList: false,
      supportsServerVariables: true,
      supportsTableMaintenance: true,
      maintenanceOps: ['VACUUM'],
      indexTypes: ['UNIQUE', 'INDEX'],
      processIdField: '',
    };
  }

  async getProcessList(): Promise<Record<string, unknown>[]> {
    return [];
  }

  async killProcess(_processId: number | string): Promise<void> {
    throw new Error('SQLite does not support process management');
  }

  async getServerVariables(): Promise<ServerVariablesResult> {
    const pragmas = [
      'auto_vacuum', 'automatic_index', 'busy_timeout', 'cache_size',
      'foreign_keys', 'journal_mode', 'locking_mode', 'max_page_count',
      'page_count', 'page_size', 'read_uncommitted', 'recursive_triggers',
      'secure_delete', 'synchronous', 'temp_store', 'wal_autocheckpoint',
    ];
    const variables = pragmas.map(name => {
      try {
        const rows = this.exec(`PRAGMA ${name}`);
        const val = rows[0] ? Object.values(rows[0])[0] : '';
        return { name, value: String(val ?? '') };
      } catch {
        return { name, value: '' };
      }
    });
    return { variables, status: [] };
  }

  async runTableMaintenance(_database: string, _table: string, op: string): Promise<QueryResult> {
    if (op.toUpperCase() === 'VACUUM') {
      this.run('VACUUM');
      return { affectedRows: 0 };
    }
    throw new Error(`Operation ${op} not supported in SQLite`);
  }
}
