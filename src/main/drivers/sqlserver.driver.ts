import * as sql from 'mssql';
import { batchRows, buildValuesClause } from './bulk-insert';
import { parseFilter } from './filter';
import {
  IDatabaseDriver, ConnectionConfig, DatabaseInfo, TableInfo, TableDataResponse,
  SortConfig, ColumnInfo, TableIndex, ForeignKey, TypeGroup, ServerCapabilities, ServerVariablesResult, QueryResult
} from '@shared/types/database';

export class SQLServerDriver implements IDatabaseDriver {
  private pool: sql.ConnectionPool | null = null;
  private transaction: sql.Transaction | null = null;

  static queryLogger: ((sql: string, durationMs: number, error?: string) => void) | null = null;

  // Converts positional ? params to @p1, @p2... and builds the mssql request
  private buildRequest(querySql: string, params: unknown[] = []): { request: sql.Request; sql: string } {
    if (!this.pool) throw new Error('Not connected');
    // Inside a transaction, requests must be bound to it or they run on a
    // separate pooled connection and miss the transaction entirely.
    const request = this.transaction ? new sql.Request(this.transaction) : this.pool.request();
    let idx = 0;
    const parameterized = querySql.replace(/\?/g, () => `@p${++idx}`);
    for (let i = 0; i < params.length; i++) {
      request.input(`p${i + 1}`, params[i] ?? null);
    }
    return { request, sql: parameterized };
  }

  private async exec<T = Record<string, unknown>>(querySql: string, params: unknown[] = []): Promise<T[]> {
    const t0 = Date.now();
    try {
      const { request, sql: paramSql } = this.buildRequest(querySql, params);
      const result = await request.query(paramSql);
      SQLServerDriver.queryLogger?.(querySql, Date.now() - t0);
      return result.recordset ?? [];
    } catch (err: unknown) {
      SQLServerDriver.queryLogger?.(querySql, Date.now() - t0, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  private async execRaw(querySql: string, params: unknown[] = []): Promise<sql.IResult<Record<string, unknown>>> {
    const t0 = Date.now();
    try {
      const { request, sql: paramSql } = this.buildRequest(querySql, params);
      const result = await request.query(paramSql);
      SQLServerDriver.queryLogger?.(querySql, Date.now() - t0);
      return result;
    } catch (err: unknown) {
      SQLServerDriver.queryLogger?.(querySql, Date.now() - t0, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  escapeIdentifier(name: string): string {
    return '[' + name.replace(/]/g, ']]') + ']';
  }

  escapeStringLiteral(val: string): string {
    return "N'" + val.replace(/'/g, "''") + "'";
  }

  async connect(config: ConnectionConfig): Promise<void> {
    this.pool = new sql.ConnectionPool({
      server: config.host,
      port: config.port || 1433,
      user: config.user,
      password: config.password,
      database: config.database || undefined,
      options: {
        trustServerCertificate: true,
        encrypt: true,
      },
      pool: { max: 1, min: 0, idleTimeoutMillis: 3000 },
    });
    await this.pool.connect();
  }

  async disconnect(): Promise<void> {
    this.transaction = null;
    if (this.pool) {
      try { await this.pool.close(); } catch { /* ignore */ }
      this.pool = null;
    }
  }

  async beginTransaction(): Promise<void> {
    if (!this.pool) throw new Error('Not connected');
    const transaction = new sql.Transaction(this.pool);
    await transaction.begin();
    this.transaction = transaction;
  }

  async commit(): Promise<void> {
    if (!this.transaction) throw new Error('No active transaction');
    try {
      await this.transaction.commit();
    } finally {
      this.transaction = null;
    }
  }

  async rollback(): Promise<void> {
    if (!this.transaction) throw new Error('No active transaction');
    try {
      await this.transaction.rollback();
    } finally {
      this.transaction = null;
    }
  }

  async getDatabases(): Promise<DatabaseInfo[]> {
    const rows = await this.exec(
      `SELECT name FROM sys.databases WHERE state = 0 ORDER BY name`
    );
    return rows.map(r => ({ name: r.name as string, tables: [] }));
  }

  async getTables(_database: string): Promise<TableInfo[]> {
    const rows = await this.exec(`
      SELECT t.name,
        CAST(ISNULL(SUM(a.total_pages) * 8192, 0) AS BIGINT) as size
      FROM sys.tables t
      LEFT JOIN sys.indexes i ON t.object_id = i.object_id
      LEFT JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
      LEFT JOIN sys.allocation_units a ON p.partition_id = a.container_id
      GROUP BY t.name
      ORDER BY t.name
    `);
    return rows.map(r => ({ name: r.name as string, size: Number(r.size) || 0 }));
  }

  async getSchema(_database: string): Promise<Record<string, string[]>> {
    const rows = await this.exec<{ TABLE_NAME: string; COLUMN_NAME: string }>(`
      SELECT TABLE_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);
    const schema: Record<string, string[]> = {};
    for (const row of rows) {
      if (!schema[row.TABLE_NAME]) schema[row.TABLE_NAME] = [];
      schema[row.TABLE_NAME].push(row.COLUMN_NAME);
    }
    return schema;
  }

  async getTableColumns(_database: string, table: string): Promise<ColumnInfo[]> {
    interface MssqlColumnRow {
      name: string;
      type: string;
      char_length: number | null;
      num_precision: number | null;
      num_scale: number | null;
      nullable: string;
      col_default: string | null;
      is_identity: number;
      col_key: string;
    }
    const rows = await this.exec<MssqlColumnRow>(`
      SELECT
        c.COLUMN_NAME as name,
        c.DATA_TYPE as type,
        c.CHARACTER_MAXIMUM_LENGTH as char_length,
        c.NUMERIC_PRECISION as num_precision,
        c.NUMERIC_SCALE as num_scale,
        c.IS_NULLABLE as nullable,
        c.COLUMN_DEFAULT as col_default,
        COLUMNPROPERTY(OBJECT_ID(c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') as is_identity,
        CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 'PRI' ELSE '' END as col_key
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN (
        SELECT ku.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
          ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME AND tc.TABLE_NAME = ku.TABLE_NAME
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_NAME = ?
      ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
      WHERE c.TABLE_NAME = ?
      ORDER BY c.ORDINAL_POSITION
    `, [table, table]);

    return rows.map(row => {
      const type = (row.type || '').toUpperCase();
      let length: string | number | null = null;
      if (row.char_length != null && row.char_length !== -1) {
        length = row.char_length;
      } else if (row.num_precision != null && row.num_scale != null && Number(row.num_scale) > 0) {
        length = `${row.num_precision},${row.num_scale}`;
      }
      return {
        name: row.name as string,
        type,
        length,
        nullable: row.nullable === 'YES',
        key: row.col_key || '',
        default: row.col_default ?? null,
        extra: row.is_identity ? 'AUTO_INCREMENT' : '',
        unsigned: false,
      };
    });
  }

  async getTableIndexes(_database: string, table: string): Promise<TableIndex[]> {
    interface MssqlIndexRow {
      index_name: string;
      is_primary_key: boolean;
      is_unique: boolean;
      column_name: string;
      method: string;
    }
    const rows = await this.exec<MssqlIndexRow>(`
      SELECT
        i.name as index_name,
        i.is_primary_key,
        i.is_unique,
        c.name as column_name,
        i.type_desc as method
      FROM sys.indexes i
      JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE i.object_id = OBJECT_ID(?) AND i.name IS NOT NULL
      ORDER BY i.name, ic.key_ordinal
    `, [table]);

    const indexMap = new Map<string, TableIndex>();
    for (const row of rows) {
      const name = row.index_name as string;
      if (!indexMap.has(name)) {
        let type = 'INDEX';
        if (row.is_primary_key) type = 'PRIMARY';
        else if (row.is_unique) type = 'UNIQUE';
        indexMap.set(name, {
          name,
          columns: [],
          unique: Boolean(row.is_unique),
          type,
          method: (row.method || '').toUpperCase(),
        });
      }
      indexMap.get(name)!.columns.push(row.column_name as string);
    }
    return Array.from(indexMap.values());
  }

  async getTableForeignKeys(_database: string, table: string): Promise<ForeignKey[]> {
    const rows = await this.exec(`
      SELECT
        fk.name as constraint_name,
        c.name as column_name,
        rt.name as referenced_table,
        rc.name as referenced_column,
        fk.update_referential_action_desc as update_rule,
        fk.delete_referential_action_desc as delete_rule
      FROM sys.foreign_keys fk
      JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      JOIN sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
      JOIN sys.tables rt ON fkc.referenced_object_id = rt.object_id
      JOIN sys.columns rc ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id
      WHERE fk.parent_object_id = OBJECT_ID(?)
      ORDER BY fk.name, fkc.constraint_column_id
    `, [table]);

    const fkMap = new Map<string, ForeignKey>();
    for (const row of rows) {
      const name = row.constraint_name as string;
      if (!fkMap.has(name)) {
        const updateRule = (row.update_rule as string || '').replace(/_/g, ' ');
        const deleteRule = (row.delete_rule as string || '').replace(/_/g, ' ');
        fkMap.set(name, {
          name,
          columns: [],
          referencedTable: row.referenced_table as string,
          referencedColumns: [],
          updateRule: updateRule === 'NO ACTION' ? 'NO ACTION' : updateRule,
          deleteRule: deleteRule === 'NO ACTION' ? 'NO ACTION' : deleteRule,
        });
      }
      fkMap.get(name)!.columns.push(row.column_name as string);
      fkMap.get(name)!.referencedColumns.push(row.referenced_column as string);
    }
    return Array.from(fkMap.values());
  }

  async getTableCreateStatement(database: string, table: string): Promise<string> {
    const esc = (n: string) => this.escapeIdentifier(n);
    const columns = await this.getTableColumns(database, table);
    const indexes = await this.getTableIndexes(database, table);
    const fks = await this.getTableForeignKeys(database, table);

    const primaryKey = indexes.find(i => i.type === 'PRIMARY');

    const colDefs = columns.map(col => {
      let typePart = col.type;
      if (col.length) typePart += `(${col.length})`;
      let def = `  ${esc(col.name)} ${typePart}`;
      if (col.extra === 'AUTO_INCREMENT') def += ' IDENTITY(1,1)';
      if (!col.nullable) def += ' NOT NULL';
      if (col.default != null && col.extra !== 'AUTO_INCREMENT') def += ` DEFAULT ${col.default}`;
      return def;
    });

    const constraints: string[] = [];
    if (primaryKey) {
      constraints.push(`  CONSTRAINT ${esc(`PK_${table}`)} PRIMARY KEY CLUSTERED (${primaryKey.columns.map(esc).join(', ')})`);
    }
    for (const fk of fks) {
      const cols = fk.columns.map(esc).join(', ');
      const refCols = fk.referencedColumns.map(esc).join(', ');
      let c = `  CONSTRAINT ${esc(fk.name)} FOREIGN KEY (${cols}) REFERENCES ${esc(fk.referencedTable)} (${refCols})`;
      if (fk.updateRule && fk.updateRule !== 'NO ACTION') c += ` ON UPDATE ${fk.updateRule}`;
      if (fk.deleteRule && fk.deleteRule !== 'NO ACTION') c += ` ON DELETE ${fk.deleteRule}`;
      constraints.push(c);
    }

    return `CREATE TABLE ${esc(table)} (\n${[...colDefs, ...constraints].join(',\n')}\n);`;
  }

  async getTableData(_database: string, table: string, limit: number, offset: number, sort?: SortConfig[], filter?: string): Promise<TableDataResponse> {
    const esc = (n: string) => this.escapeIdentifier(n);

    const colRows = await this.exec(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
      [table]
    );
    const columns = colRows.map(r => r.COLUMN_NAME as string);

    const filterParams: unknown[] = [];
    let whereClause = '';

    if (filter && columns.length > 0) {
      const parsed = parseFilter(filter);
      if (parsed.isSearch) {
        const searchTerms = columns.map(col => `CAST(${esc(col)} AS NVARCHAR(MAX)) LIKE ?`).join(' OR ');
        whereClause = `WHERE ${searchTerms}`;
        columns.forEach(() => filterParams.push(`%${filter}%`));
      } else {
        whereClause = parsed.whereClause;
      }
    }

    // SQL Server requires ORDER BY for OFFSET/FETCH
    let orderBy = 'ORDER BY (SELECT NULL)';
    if (sort && sort.length > 0) {
      orderBy = 'ORDER BY ' + sort.map(s => `${esc(s.column)} ${s.direction === 'DESC' ? 'DESC' : 'ASC'}`).join(', ');
    }

    const safeLimit = Math.max(1, Math.floor(Number(limit)));
    const safeOffset = Math.max(0, Math.floor(Number(offset)));

    const query = `SELECT * FROM ${esc(table)} ${whereClause} ${orderBy} OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`;
    const countQuery = `SELECT COUNT(*) as total FROM ${esc(table)} ${whereClause}`;

    const [dataResult, countResult] = await Promise.all([
      this.exec(query, [...filterParams, safeOffset, safeLimit]),
      this.exec(countQuery, filterParams),
    ]);

    return {
      columns,
      rows: dataResult,
      total: Number(countResult[0]?.total ?? 0),
    };
  }

  async executeQuery(querySql: string): Promise<QueryResult> {
    const result = await this.execRaw(querySql);
    if (result.recordset && result.recordset.length > 0) return result.recordset;
    const affected = result.rowsAffected?.[0] ?? 0;
    return { affectedRows: affected };
  }

  async addIndex(_database: string, table: string, index: TableIndex): Promise<void> {
    const esc = (n: string) => this.escapeIdentifier(n);
    const cols = index.columns.map(esc).join(', ');
    if (index.type === 'PRIMARY') {
      const name = esc(index.name || `PK_${table}`);
      await this.exec(`ALTER TABLE ${esc(table)} ADD CONSTRAINT ${name} PRIMARY KEY CLUSTERED (${cols})`);
    } else if (index.type === 'UNIQUE') {
      const name = esc(index.name || `UQ_${table}_${index.columns.join('_')}`);
      await this.exec(`CREATE UNIQUE NONCLUSTERED INDEX ${name} ON ${esc(table)} (${cols})`);
    } else {
      const name = esc(index.name || `IX_${table}_${index.columns.join('_')}`);
      await this.exec(`CREATE NONCLUSTERED INDEX ${name} ON ${esc(table)} (${cols})`);
    }
  }

  async addForeignKey(_database: string, table: string, fk: ForeignKey): Promise<void> {
    const esc = (n: string) => this.escapeIdentifier(n);
    const cols = fk.columns.map(esc).join(', ');
    const refCols = fk.referencedColumns.map(esc).join(', ');
    const ALLOWED_FK_RULES = ['CASCADE', 'NO ACTION', 'RESTRICT', 'SET NULL', 'SET DEFAULT'];
    const updateRule = (fk.updateRule || '').toUpperCase();
    const deleteRule = (fk.deleteRule || '').toUpperCase();
    if (fk.updateRule && !ALLOWED_FK_RULES.includes(updateRule)) throw new Error(`Invalid ON UPDATE rule: ${fk.updateRule}`);
    if (fk.deleteRule && !ALLOWED_FK_RULES.includes(deleteRule)) throw new Error(`Invalid ON DELETE rule: ${fk.deleteRule}`);
    const constraintName = esc(fk.name || `FK_${table}_${fk.referencedTable}`);
    let s = `ALTER TABLE ${esc(table)} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${cols}) REFERENCES ${esc(fk.referencedTable)} (${refCols})`;
    if (fk.updateRule) s += ` ON UPDATE ${updateRule}`;
    if (fk.deleteRule) s += ` ON DELETE ${deleteRule}`;
    await this.exec(s);
  }

  async dropIndex(_database: string, table: string, indexName: string): Promise<void> {
    const esc = (n: string) => this.escapeIdentifier(n);
    // Determine if it's a constraint or a standalone index
    const constraints = await this.exec(`
      SELECT name FROM sys.key_constraints
      WHERE parent_object_id = OBJECT_ID(?) AND name = ?
    `, [table, indexName]);
    if (constraints.length > 0) {
      await this.exec(`ALTER TABLE ${esc(table)} DROP CONSTRAINT ${esc(indexName)}`);
    } else {
      await this.exec(`DROP INDEX ${esc(indexName)} ON ${esc(table)}`);
    }
  }

  async dropForeignKey(_database: string, table: string, fkName: string): Promise<void> {
    const esc = (n: string) => this.escapeIdentifier(n);
    await this.exec(`ALTER TABLE ${esc(table)} DROP CONSTRAINT ${esc(fkName)}`);
  }

  async addColumn(_database: string, table: string, column: ColumnInfo, _afterColumn?: string): Promise<void> {
    const esc = (n: string) => this.escapeIdentifier(n);
    let typePart = column.type;
    if (column.length) typePart += `(${column.length})`;
    let s = `ALTER TABLE ${esc(table)} ADD ${esc(column.name)} ${typePart}`;
    if (!column.nullable) s += ' NOT NULL';
    if (column.default != null) s += ` DEFAULT ${this.escapeStringLiteral(String(column.default))}`;
    await this.exec(s);
  }

  async updateColumn(_database: string, table: string, oldColumnName: string, newColumn: ColumnInfo, _afterColumn?: string): Promise<void> {
    const esc = (n: string) => this.escapeIdentifier(n);
    const tbl = esc(table);
    const oldCol = esc(oldColumnName);

    let typePart = newColumn.type;
    if (newColumn.length) typePart += `(${newColumn.length})`;

    // Drop existing DEFAULT constraint for this column
    const defaultConstraints = await this.exec<{ name: string }>(`
      SELECT d.name FROM sys.default_constraints d
      JOIN sys.columns c ON d.parent_object_id = c.object_id AND d.parent_column_id = c.column_id
      WHERE c.object_id = OBJECT_ID(?) AND c.name = ?
    `, [table, oldColumnName]);
    if (defaultConstraints.length > 0) {
      await this.exec(`ALTER TABLE ${tbl} DROP CONSTRAINT ${esc(defaultConstraints[0].name)}`);
    }

    // Change type / nullability
    const nullability = newColumn.nullable ? 'NULL' : 'NOT NULL';
    await this.exec(`ALTER TABLE ${tbl} ALTER COLUMN ${oldCol} ${typePart} ${nullability}`);

    // Add new DEFAULT if provided
    if (newColumn.default != null) {
      const constraintName = esc(`DF_${table}_${newColumn.name}`);
      await this.exec(`ALTER TABLE ${tbl} ADD CONSTRAINT ${constraintName} DEFAULT ${this.escapeStringLiteral(String(newColumn.default))} FOR ${oldCol}`);
    }

    // Rename column last (old name still valid above)
    if (newColumn.name !== oldColumnName) {
      await this.exec(`EXEC sp_rename ?, ?, 'COLUMN'`, [`${table}.${oldColumnName}`, newColumn.name]);
    }
  }

  async insertRows(_database: string, table: string, columns: string[], rows: (string | null)[][]): Promise<number> {
    if (rows.length === 0 || columns.length === 0) return 0;
    const colList = columns.map(c => this.escapeIdentifier(c)).join(', ');

    // '?' markers are rewritten to @p1, @p2... by buildRequest.
    for (const batch of batchRows(rows, columns.length)) {
      const values = buildValuesClause(batch.length, columns.length, () => '?');
      await this.exec(`INSERT INTO ${this.escapeIdentifier(table)} (${colList}) VALUES ${values}`, batch.flat());
    }
    return rows.length;
  }

  async getSupportedTypes(): Promise<TypeGroup[]> {
    return [
      { group: 'Entero', types: ['TINYINT', 'SMALLINT', 'INT', 'BIGINT'] },
      { group: 'Real', types: ['DECIMAL', 'NUMERIC', 'FLOAT', 'REAL', 'MONEY', 'SMALLMONEY'] },
      { group: 'Texto', types: ['CHAR', 'VARCHAR', 'NCHAR', 'NVARCHAR', 'TEXT', 'NTEXT'] },
      { group: 'Binario', types: ['BINARY', 'VARBINARY', 'IMAGE'] },
      { group: 'Tiempo', types: ['DATE', 'TIME', 'DATETIME', 'DATETIME2', 'SMALLDATETIME', 'DATETIMEOFFSET'] },
      { group: 'Booleano', types: ['BIT'] },
      { group: 'Otros', types: ['UNIQUEIDENTIFIER', 'XML', 'GEOGRAPHY', 'GEOMETRY'] },
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
      supportsProcessList: true,
      supportsServerVariables: true,
      supportsTableMaintenance: true,
      maintenanceOps: ['REBUILD_INDEXES', 'UPDATE_STATISTICS', 'CHECK_INTEGRITY'],
      indexTypes: ['PRIMARY', 'UNIQUE', 'INDEX'],
      processIdField: 'spid',
    };
  }

  async getProcessList(): Promise<Record<string, unknown>[]> {
    return this.exec(`
      SELECT
        r.session_id as spid,
        s.login_name as [User],
        s.host_name as [Host],
        DB_NAME(r.database_id) as [db],
        r.command as [Command],
        r.total_elapsed_time / 1000 as [Time],
        r.status as [State],
        t.text as [Info]
      FROM sys.dm_exec_requests r
      JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
      OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
      WHERE r.session_id != @@SPID
      ORDER BY r.session_id
    `);
  }

  async killProcess(processId: number | string): Promise<void> {
    const spid = Number(processId);
    if (!Number.isInteger(spid) || spid <= 0) throw new Error('Invalid process id');
    // KILL does not accept params — validate then inject
    await this.exec(`KILL ${spid}`);
  }

  async getServerVariables(): Promise<ServerVariablesResult> {
    const rows = await this.exec(`
      SELECT name, CAST(value_in_use AS NVARCHAR(255)) as value
      FROM sys.configurations
      ORDER BY name
    `);
    return {
      variables: rows.map(r => ({ name: r.name as string, value: String(r.value ?? '') })),
      status: [],
    };
  }

  async runTableMaintenance(_database: string, table: string, op: string): Promise<QueryResult> {
    const esc = (n: string) => this.escapeIdentifier(n);
    switch (op.toUpperCase()) {
      case 'REBUILD_INDEXES':
        return this.exec<Record<string, unknown>>(`ALTER INDEX ALL ON ${esc(table)} REBUILD`);
      case 'UPDATE_STATISTICS':
        return this.exec<Record<string, unknown>>(`UPDATE STATISTICS ${esc(table)}`);
      case 'CHECK_INTEGRITY':
        return this.exec<Record<string, unknown>>(`DBCC CHECKTABLE(${this.escapeStringLiteral(table)})`);
      default:
        throw new Error(`Operation ${op} not supported in SQL Server`);
    }
  }
}
