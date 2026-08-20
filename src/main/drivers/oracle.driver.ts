import type oracledb from 'oracledb';
import {
  IDatabaseDriver, ConnectionConfig, DatabaseInfo, TableInfo, TableDataResponse,
  SortConfig, ColumnInfo, TableIndex, ForeignKey, TypeGroup, ServerCapabilities, ServerVariablesResult, QueryResult
} from '@shared/types/database';

let _odb: typeof oracledb | null = null
function odb(): typeof oracledb {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy-loaded: native addon, kept external so unused drivers don't pay its load cost
  if (!_odb) _odb = require('oracledb')
  return _odb!
}

export class OracleDriver implements IDatabaseDriver {
  private connection: oracledb.Connection | null = null;
  private inTransaction = false;

  static queryLogger: ((sql: string, durationMs: number, error?: string) => void) | null = null;

  /**
   * node-oracledb defaults `autoCommit` to false, so without this every
   * INSERT/UPDATE/DELETE was silently rolled back when the connection closed.
   * Statements auto-commit unless an explicit transaction is open.
   */
  private get autoCommit(): boolean {
    return !this.inTransaction;
  }

  // Positional :1, :2 bind variables
  private async exec<T = Record<string, unknown>>(querySql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.connection) throw new Error('Not connected');
    const t0 = Date.now();
    try {
      const result = await this.connection.execute<T>(querySql, params, {
        outFormat: odb().OUT_FORMAT_OBJECT,
        autoCommit: this.autoCommit,
        fetchTypeHandler: (meta) => {
          if (meta.dbType === odb().DB_TYPE_CLOB || meta.dbType === odb().DB_TYPE_NCLOB) {
            return { type: odb().DB_TYPE_VARCHAR };
          }
          if (meta.dbType === odb().DB_TYPE_BLOB || meta.dbType === odb().DB_TYPE_RAW) {
            return { type: odb().DB_TYPE_VARCHAR };
          }
        },
      });
      OracleDriver.queryLogger?.(querySql, Date.now() - t0);
      return result.rows ?? [];
    } catch (err: unknown) {
      OracleDriver.queryLogger?.(querySql, Date.now() - t0, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  private async execRaw(querySql: string, params: unknown[] = []): Promise<oracledb.Result<Record<string, unknown>>> {
    if (!this.connection) throw new Error('Not connected');
    const t0 = Date.now();
    try {
      const result = await this.connection.execute<Record<string, unknown>>(querySql, params, {
        outFormat: odb().OUT_FORMAT_OBJECT,
        autoCommit: this.autoCommit,
        fetchTypeHandler: (meta) => {
          if (meta.dbType === odb().DB_TYPE_CLOB || meta.dbType === odb().DB_TYPE_NCLOB) {
            return { type: odb().DB_TYPE_VARCHAR };
          }
        },
      });
      OracleDriver.queryLogger?.(querySql, Date.now() - t0);
      return result;
    } catch (err: unknown) {
      OracleDriver.queryLogger?.(querySql, Date.now() - t0, err instanceof Error ? err.message : String(err));
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
    const connectString = `${config.host}:${config.port || 1521}/${config.database || 'ORCL'}`;
    this.connection = await odb().getConnection({
      user: config.user,
      password: config.password,
      connectString,
    });
  }

  async disconnect(): Promise<void> {
    this.inTransaction = false;
    if (this.connection) {
      try { await this.connection.close(); } catch { /* ignore */ }
      this.connection = null;
    }
  }

  // Oracle has no explicit BEGIN — a transaction starts with the first DML.
  // Flipping this flag just turns off the per-statement autoCommit above.
  async beginTransaction(): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    this.inTransaction = true;
  }

  async commit(): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    try {
      await this.connection.commit();
    } finally {
      this.inTransaction = false;
    }
  }

  async rollback(): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    try {
      await this.connection.rollback();
    } finally {
      this.inTransaction = false;
    }
  }

  async getDatabases(): Promise<DatabaseInfo[]> {
    const rows = await this.exec<{ name: string }>(
      `SELECT username as "name" FROM all_users ORDER BY username`
    );
    return rows.map(r => ({ name: r.name, tables: [] }));
  }

  async getTables(database: string): Promise<TableInfo[]> {
    const rows = await this.exec<{ name: string }>(
      `SELECT table_name as "name", 0 as "size" FROM all_tables WHERE owner = UPPER(:1) ORDER BY table_name`,
      [database]
    );
    return rows.map(r => ({ name: r.name, size: 0 }));
  }

  async getSchema(database: string): Promise<Record<string, string[]>> {
    const rows = await this.exec<{ TABLE_NAME: string; COLUMN_NAME: string }>(
      `SELECT table_name, column_name FROM all_tab_columns WHERE owner = UPPER(:1) ORDER BY table_name, column_id`,
      [database]
    );
    const schema: Record<string, string[]> = {};
    for (const row of rows) {
      if (!schema[row.TABLE_NAME]) schema[row.TABLE_NAME] = [];
      schema[row.TABLE_NAME].push(row.COLUMN_NAME);
    }
    return schema;
  }

  async getTableColumns(database: string, table: string): Promise<ColumnInfo[]> {
    interface OracleColumnRow {
      COLUMN_NAME: string;
      DATA_TYPE: string;
      DATA_LENGTH: number | null;
      CHAR_LENGTH: number | null;
      DATA_PRECISION: number | null;
      DATA_SCALE: number | null;
      NULLABLE: string;
      DATA_DEFAULT: string | null;
      IDENTITY_COLUMN: string;
      COL_KEY: string;
    }
    const rows = await this.exec<OracleColumnRow>(`
      SELECT
        c.column_name,
        c.data_type,
        c.data_length,
        c.char_length,
        c.data_precision,
        c.data_scale,
        c.nullable,
        c.data_default,
        c.identity_column,
        CASE WHEN pk.column_name IS NOT NULL THEN 'PRI' ELSE '' END as col_key
      FROM all_tab_columns c
      LEFT JOIN (
        SELECT cc.column_name
        FROM all_constraints con
        JOIN all_cons_columns cc ON con.constraint_name = cc.constraint_name AND con.owner = cc.owner
        WHERE con.constraint_type = 'P'
          AND con.table_name = UPPER(:1)
          AND con.owner = UPPER(:2)
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_name = UPPER(:3) AND c.owner = UPPER(:4)
      ORDER BY c.column_id
    `, [table, database, table, database]);

    return rows.map(row => {
      const type = row.DATA_TYPE || '';
      let length: string | number | null = null;
      if (['VARCHAR2', 'NVARCHAR2', 'CHAR', 'NCHAR'].includes(type)) {
        length = row.CHAR_LENGTH ?? row.DATA_LENGTH ?? null;
      } else if (row.DATA_PRECISION != null && row.DATA_SCALE != null && Number(row.DATA_SCALE) > 0) {
        length = `${row.DATA_PRECISION},${row.DATA_SCALE}`;
      } else if (row.DATA_PRECISION != null) {
        length = row.DATA_PRECISION;
      }
      return {
        name: row.COLUMN_NAME,
        type,
        length,
        nullable: row.NULLABLE === 'Y',
        key: row.COL_KEY || '',
        default: row.DATA_DEFAULT != null ? String(row.DATA_DEFAULT).trim() : null,
        extra: row.IDENTITY_COLUMN === 'YES' ? 'AUTO_INCREMENT' : '',
        unsigned: false,
      };
    });
  }

  async getTableIndexes(database: string, table: string): Promise<TableIndex[]> {
    interface OracleIndexRow {
      INDEX_NAME: string;
      UNIQUENESS: string;
      COLUMN_NAME: string;
      METHOD: string;
      IS_PRIMARY: number;
    }
    const rows = await this.exec<OracleIndexRow>(`
      SELECT
        i.index_name,
        i.uniqueness,
        ic.column_name,
        i.index_type as method,
        CASE WHEN c.constraint_type = 'P' THEN 1 ELSE 0 END as is_primary
      FROM all_indexes i
      JOIN all_ind_columns ic ON i.index_name = ic.index_name AND i.owner = ic.index_owner
      LEFT JOIN all_constraints c
        ON c.index_name = i.index_name AND c.owner = i.owner AND c.table_name = i.table_name
      WHERE i.table_name = UPPER(:1) AND i.table_owner = UPPER(:2)
      ORDER BY i.index_name, ic.column_position
    `, [table, database]);

    const indexMap = new Map<string, TableIndex>();
    for (const row of rows) {
      const name = row.INDEX_NAME;
      if (!indexMap.has(name)) {
        let type = 'INDEX';
        if (row.IS_PRIMARY === 1) type = 'PRIMARY';
        else if (row.UNIQUENESS === 'UNIQUE') type = 'UNIQUE';
        indexMap.set(name, {
          name,
          columns: [],
          unique: row.UNIQUENESS === 'UNIQUE',
          type,
          method: (row.METHOD || 'NORMAL').toUpperCase(),
        });
      }
      indexMap.get(name)!.columns.push(row.COLUMN_NAME);
    }
    return Array.from(indexMap.values());
  }

  async getTableForeignKeys(database: string, table: string): Promise<ForeignKey[]> {
    interface OracleFkRow {
      NAME: string;
      COLUMN_NAME: string;
      REFERENCED_TABLE: string;
      REFERENCED_COLUMN: string;
      DELETE_RULE: string;
    }
    const rows = await this.exec<OracleFkRow>(`
      SELECT
        fk.constraint_name as name,
        fkc.column_name,
        pk_t.table_name as referenced_table,
        pkc.column_name as referenced_column,
        fk.delete_rule
      FROM all_constraints fk
      JOIN all_cons_columns fkc ON fk.constraint_name = fkc.constraint_name AND fk.owner = fkc.owner
      JOIN all_constraints pk ON fk.r_constraint_name = pk.constraint_name AND fk.r_owner = pk.owner
      JOIN all_tables pk_t ON pk.table_name = pk_t.table_name AND pk.owner = pk_t.owner
      JOIN all_cons_columns pkc ON pk.constraint_name = pkc.constraint_name AND pk.owner = pkc.owner AND fkc.position = pkc.position
      WHERE fk.constraint_type = 'R'
        AND fk.table_name = UPPER(:1)
        AND fk.owner = UPPER(:2)
      ORDER BY fk.constraint_name, fkc.position
    `, [table, database]);

    const fkMap = new Map<string, ForeignKey>();
    for (const row of rows) {
      const name = row.NAME;
      if (!fkMap.has(name)) {
        const deleteRule = (row.DELETE_RULE || 'NO ACTION').replace(/_/g, ' ');
        fkMap.set(name, {
          name,
          columns: [],
          referencedTable: row.REFERENCED_TABLE,
          referencedColumns: [],
          updateRule: 'NO ACTION', // Oracle does not support ON UPDATE
          deleteRule,
        });
      }
      fkMap.get(name)!.columns.push(row.COLUMN_NAME);
      fkMap.get(name)!.referencedColumns.push(row.REFERENCED_COLUMN);
    }
    return Array.from(fkMap.values());
  }

  async getTableCreateStatement(database: string, table: string): Promise<string> {
    try {
      const rows = await this.exec<{ DDL: string }>(
        `SELECT DBMS_METADATA.GET_DDL('TABLE', UPPER(:1), UPPER(:2)) as ddl FROM DUAL`,
        [table, database]
      );
      return rows[0]?.DDL ? String(rows[0].DDL).trim() : '';
    } catch {
      // Fallback: generate from column metadata
      return this._generateCreateTable(database, table);
    }
  }

  private async _generateCreateTable(database: string, table: string): Promise<string> {
    const esc = (n: string) => this.escapeIdentifier(n);
    const columns = await this.getTableColumns(database, table);
    const indexes = await this.getTableIndexes(database, table);
    const fks = await this.getTableForeignKeys(database, table);
    const primaryKey = indexes.find(i => i.type === 'PRIMARY');

    const colDefs = columns.map(col => {
      let typePart = col.type;
      if (col.length) typePart += `(${col.length})`;
      let def = `  ${esc(col.name)} ${typePart}`;
      if (col.extra === 'AUTO_INCREMENT') def += ' GENERATED ALWAYS AS IDENTITY';
      if (!col.nullable) def += ' NOT NULL';
      if (col.default != null && col.extra !== 'AUTO_INCREMENT') def += ` DEFAULT ${col.default}`;
      return def;
    });

    const constraints: string[] = [];
    if (primaryKey) {
      constraints.push(`  CONSTRAINT ${esc(`PK_${table}`)} PRIMARY KEY (${primaryKey.columns.map(esc).join(', ')})`);
    }
    for (const fk of fks) {
      const cols = fk.columns.map(esc).join(', ');
      const refCols = fk.referencedColumns.map(esc).join(', ');
      let c = `  CONSTRAINT ${esc(fk.name)} FOREIGN KEY (${cols}) REFERENCES ${esc(fk.referencedTable)} (${refCols})`;
      if (fk.deleteRule && fk.deleteRule !== 'NO ACTION') c += ` ON DELETE ${fk.deleteRule}`;
      constraints.push(c);
    }

    return `CREATE TABLE ${esc(table)} (\n${[...colDefs, ...constraints].join(',\n')}\n)`;
  }

  async getTableData(_database: string, table: string, limit: number, offset: number, sort?: SortConfig[], filter?: string): Promise<TableDataResponse> {
    const esc = (n: string) => this.escapeIdentifier(n);

    const colRows = await this.exec<{ COLUMN_NAME: string }>(
      `SELECT column_name FROM all_tab_columns WHERE table_name = UPPER(:1) ORDER BY column_id`,
      [table]
    );
    const columns = colRows.map(r => r.COLUMN_NAME);

    const filterParams: unknown[] = [];
    let whereClause = '';

    if (filter && columns.length > 0) {
      const trimmed = filter.trim();
      const lower = trimmed.toLowerCase();
      const isRaw = lower.startsWith('where ') || lower.includes('=') || lower.includes('>') || lower.includes('<') || lower.includes(' like ') || lower.includes(' is null') || lower.includes(' is not null') || lower.includes(' between ') || lower.includes(' in (');
      if (isRaw) {
        whereClause = lower.startsWith('where ') ? trimmed : `WHERE ${trimmed}`;
      } else {
        const searchTerms = columns.map(col => `TO_CHAR(${esc(col)}) LIKE :${filterParams.length + 1 + columns.indexOf(col)}`).join(' OR ');
        whereClause = `WHERE ${searchTerms}`;
        columns.forEach(() => filterParams.push(`%${filter}%`));
      }
    }

    const orderBy = (sort && sort.length > 0)
      ? 'ORDER BY ' + sort.map(s => `${esc(s.column.toUpperCase())} ${s.direction === 'DESC' ? 'DESC' : 'ASC'}`).join(', ')
      : 'ORDER BY ROWID';

    const safeLimit = Math.max(1, Math.floor(Number(limit)));
    const safeOffset = Math.max(0, Math.floor(Number(offset)));
    const offsetIdx = filterParams.length + 1;
    const limitIdx = filterParams.length + 2;

    const tableRef = esc(table.toUpperCase());
    const query = `SELECT * FROM ${tableRef} ${whereClause} ${orderBy} OFFSET :${offsetIdx} ROWS FETCH NEXT :${limitIdx} ROWS ONLY`;
    const countQuery = `SELECT COUNT(*) as "total" FROM ${tableRef} ${whereClause}`;

    const [dataRows, countRows] = await Promise.all([
      this.exec(query, [...filterParams, safeOffset, safeLimit]),
      this.exec<{ total: number }>(countQuery, filterParams),
    ]);

    // Oracle returns uppercase column names — normalize to original casing from metadata
    const normalized = dataRows.map(row => {
      const out: Record<string, unknown> = {};
      for (const col of columns) {
        out[col] = row[col] ?? row[col.toUpperCase()] ?? null;
      }
      return out;
    });

    return {
      columns,
      rows: normalized,
      total: Number(countRows[0]?.total ?? 0),
    };
  }

  async executeQuery(querySql: string): Promise<QueryResult> {
    const result = await this.execRaw(querySql);
    if (result.rows && result.rows.length > 0) return result.rows;
    return { affectedRows: result.rowsAffected ?? 0 };
  }

  async addIndex(_database: string, table: string, index: TableIndex): Promise<void> {
    const esc = (n: string) => this.escapeIdentifier(n);
    const cols = index.columns.map(esc).join(', ');
    if (index.type === 'PRIMARY') {
      const name = esc(index.name || `PK_${table}`);
      await this.exec(`ALTER TABLE ${esc(table)} ADD CONSTRAINT ${name} PRIMARY KEY (${cols})`);
    } else if (index.type === 'UNIQUE') {
      const name = esc(index.name || `UQ_${table}_${index.columns.join('_')}`);
      await this.exec(`CREATE UNIQUE INDEX ${name} ON ${esc(table)} (${cols})`);
    } else {
      const name = esc(index.name || `IX_${table}_${index.columns.join('_')}`);
      await this.exec(`CREATE INDEX ${name} ON ${esc(table)} (${cols})`);
    }
  }

  async addForeignKey(_database: string, table: string, fk: ForeignKey): Promise<void> {
    const esc = (n: string) => this.escapeIdentifier(n);
    const cols = fk.columns.map(esc).join(', ');
    const refCols = fk.referencedColumns.map(esc).join(', ');
    // Oracle only supports ON DELETE (not ON UPDATE)
    const ALLOWED_DELETE_RULES = ['CASCADE', 'NO ACTION', 'SET NULL'];
    const deleteRule = (fk.deleteRule || '').toUpperCase();
    if (fk.deleteRule && !ALLOWED_DELETE_RULES.includes(deleteRule)) throw new Error(`Invalid ON DELETE rule: ${fk.deleteRule}`);
    const constraintName = esc(fk.name || `FK_${table}_${fk.referencedTable}`);
    let s = `ALTER TABLE ${esc(table)} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${cols}) REFERENCES ${esc(fk.referencedTable)} (${refCols})`;
    if (fk.deleteRule && deleteRule !== 'NO ACTION') s += ` ON DELETE ${deleteRule}`;
    await this.exec(s);
  }

  async dropIndex(_database: string, table: string, indexName: string): Promise<void> {
    const esc = (n: string) => this.escapeIdentifier(n);
    // Check if it's a constraint (PRIMARY KEY or UNIQUE constraint)
    const constraints = await this.exec(
      `SELECT constraint_name FROM all_constraints WHERE constraint_name = UPPER(:1) AND table_name = UPPER(:2) AND constraint_type IN ('P', 'U')`,
      [indexName, table]
    );
    if (constraints.length > 0) {
      await this.exec(`ALTER TABLE ${esc(table)} DROP CONSTRAINT ${esc(indexName)}`);
    } else {
      await this.exec(`DROP INDEX ${esc(indexName)}`);
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
    let s = `ALTER TABLE ${esc(table)} ADD (${esc(column.name)} ${typePart}`;
    if (column.default != null) s += ` DEFAULT ${this.escapeStringLiteral(String(column.default))}`;
    if (!column.nullable) s += ' NOT NULL';
    s += ')';
    await this.exec(s);
  }

  async updateColumn(_database: string, table: string, oldColumnName: string, newColumn: ColumnInfo, _afterColumn?: string): Promise<void> {
    const esc = (n: string) => this.escapeIdentifier(n);
    const tbl = esc(table);
    const oldCol = esc(oldColumnName);

    let typePart = newColumn.type;
    if (newColumn.length) typePart += `(${newColumn.length})`;

    // MODIFY handles type, nullability and default in one statement
    let modify = `ALTER TABLE ${tbl} MODIFY (${oldCol} ${typePart}`;
    if (newColumn.default != null) {
      modify += ` DEFAULT ${this.escapeStringLiteral(String(newColumn.default))}`;
    } else {
      modify += ` DEFAULT NULL`;
    }
    modify += newColumn.nullable ? ' NULL' : ' NOT NULL';
    modify += ')';
    await this.exec(modify);

    // Rename column last (Oracle 9i+)
    if (newColumn.name !== oldColumnName) {
      await this.exec(`ALTER TABLE ${tbl} RENAME COLUMN ${oldCol} TO ${esc(newColumn.name)}`);
    }
  }

  async getSupportedTypes(): Promise<TypeGroup[]> {
    return [
      { group: 'Entero', types: ['NUMBER', 'INTEGER', 'SMALLINT'] },
      { group: 'Real', types: ['FLOAT', 'BINARY_FLOAT', 'BINARY_DOUBLE', 'NUMBER'] },
      { group: 'Texto', types: ['VARCHAR2', 'NVARCHAR2', 'CHAR', 'NCHAR', 'CLOB', 'NCLOB', 'LONG'] },
      { group: 'Binario', types: ['RAW', 'LONG RAW', 'BLOB', 'BFILE'] },
      { group: 'Tiempo', types: ['DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMP WITH LOCAL TIME ZONE', 'INTERVAL YEAR TO MONTH', 'INTERVAL DAY TO SECOND'] },
      { group: 'Otros', types: ['XMLTYPE', 'SDO_GEOMETRY', 'ROWID', 'UROWID'] },
    ];
  }

  getCapabilities(): ServerCapabilities {
    return {
      supportsTransactionalDDL: false, // Oracle implicitly commits on DDL
      supportsUnsigned: false,
      supportsVirtuality: false,
      supportsCollation: false,
      supportsColumnComment: true,
      supportsFullTextIndex: false,
      supportsSpatialIndex: false,
      supportsProcessList: true,
      supportsServerVariables: true,
      supportsTableMaintenance: true,
      maintenanceOps: ['ANALYZE_STATS', 'VALIDATE', 'SHRINK'],
      indexTypes: ['PRIMARY', 'UNIQUE', 'INDEX'],
      processIdField: 'spid',
    };
  }

  async getProcessList(): Promise<Record<string, unknown>[]> {
    const rows = await this.exec(`
      SELECT
        s.sid || ',' || s.serial# as "spid",
        s.username as "User",
        s.machine as "Host",
        s.schemaname as "db",
        s.program as "Command",
        s.seconds_in_wait as "Time",
        s.status as "State",
        q.sql_fulltext as "Info"
      FROM v$session s
      LEFT JOIN v$sql q ON s.sql_id = q.sql_id AND s.sql_child_number = q.child_number
      WHERE s.username IS NOT NULL
      ORDER BY s.sid
    `);
    return rows;
  }

  async killProcess(processId: number | string): Promise<void> {
    // processId format: 'sid,serial#'
    const str = String(processId);
    if (!/^\d+,\d+$/.test(str)) throw new Error('Oracle process id must be in "sid,serial#" format');
    await this.exec(`ALTER SYSTEM KILL SESSION :1`, [str]);
  }

  async getServerVariables(): Promise<ServerVariablesResult> {
    const rows = await this.exec<{ NAME: string; VALUE: string }>(
      `SELECT name, value FROM v$parameter ORDER BY name`
    );
    return {
      variables: rows.map(r => ({ name: r.NAME, value: String(r.VALUE ?? '') })),
      status: [],
    };
  }

  async runTableMaintenance(_database: string, table: string, op: string): Promise<QueryResult> {
    const esc = (n: string) => this.escapeIdentifier(n);
    switch (op.toUpperCase()) {
      case 'ANALYZE_STATS':
        await this.exec(
          `BEGIN DBMS_STATS.GATHER_TABLE_STATS(USER, UPPER(:1)); END;`,
          [table]
        );
        return { affectedRows: 0 };
      case 'VALIDATE':
        return this.exec<Record<string, unknown>>(`ANALYZE TABLE ${esc(table)} VALIDATE STRUCTURE`);
      case 'SHRINK':
        await this.exec(`ALTER TABLE ${esc(table)} SHRINK SPACE`);
        return { affectedRows: 0 };
      default:
        throw new Error(`Operation ${op} not supported in Oracle`);
    }
  }
}
