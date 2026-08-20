import { Client, QueryResult as PgQueryResult } from 'pg';
import { batchRows, buildValuesClause } from './bulk-insert';
import { parseFilter } from './filter';
import {
  IDatabaseDriver, ConnectionConfig, DatabaseInfo, TableInfo, TableDataResponse,
  SortConfig, ColumnInfo, TableIndex, ForeignKey, TypeGroup, ServerCapabilities, ServerVariablesResult, QueryResult
} from '@shared/types/database';

const PG_TYPE_MAP: Record<string, string> = {
  'character varying': 'VARCHAR',
  'character': 'CHAR',
  'integer': 'INTEGER',
  'bigint': 'BIGINT',
  'smallint': 'SMALLINT',
  'double precision': 'DOUBLE PRECISION',
  'real': 'REAL',
  'boolean': 'BOOLEAN',
  'timestamp without time zone': 'TIMESTAMP',
  'timestamp with time zone': 'TIMESTAMPTZ',
  'date': 'DATE',
  'time without time zone': 'TIME',
  'time with time zone': 'TIMETZ',
  'bytea': 'BYTEA',
  'text': 'TEXT',
  'json': 'JSON',
  'jsonb': 'JSONB',
  'uuid': 'UUID',
  'numeric': 'NUMERIC',
  'decimal': 'DECIMAL',
  'interval': 'INTERVAL',
  'bit': 'BIT',
  'bit varying': 'VARBIT',
  'inet': 'INET',
  'cidr': 'CIDR',
  'macaddr': 'MACADDR',
};

export class PostgreSQLDriver implements IDatabaseDriver {
  private client: Client | null = null;

  static queryLogger: ((sql: string, durationMs: number, error?: string) => void) | null = null;

  private async exec<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this.client) throw new Error('Not connected');
    const t0 = Date.now();
    try {
      const result = await this.client.query(sql, params);
      PostgreSQLDriver.queryLogger?.(sql, Date.now() - t0);
      return result.rows;
    } catch (err: unknown) {
      PostgreSQLDriver.queryLogger?.(sql, Date.now() - t0, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  private async execRaw(sql: string, params?: unknown[]): Promise<PgQueryResult> {
    if (!this.client) throw new Error('Not connected');
    const t0 = Date.now();
    try {
      const result = await this.client.query(sql, params);
      PostgreSQLDriver.queryLogger?.(sql, Date.now() - t0);
      return result;
    } catch (err: unknown) {
      PostgreSQLDriver.queryLogger?.(sql, Date.now() - t0, err instanceof Error ? err.message : String(err));
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
    this.client = new Client({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database || 'postgres',
    });
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try { await this.client.end(); } catch { /* ignore */ }
      this.client = null;
    }
  }

  async beginTransaction(): Promise<void> {
    await this.exec('BEGIN');
  }

  async commit(): Promise<void> {
    await this.exec('COMMIT');
  }

  async rollback(): Promise<void> {
    await this.exec('ROLLBACK');
  }

  async getDatabases(): Promise<DatabaseInfo[]> {
    const rows = await this.exec<{ name: string }>(
      `SELECT datname as name FROM pg_database WHERE datistemplate = false ORDER BY datname`
    );
    return rows.map(row => ({ name: row.name, tables: [] }));
  }

  async getTables(_database: string): Promise<TableInfo[]> {
    const rows = await this.exec<{ name: string; size: string | number }>(
      `SELECT tablename as name, pg_total_relation_size(quote_ident(tablename))::bigint as size
       FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    return rows.map(row => ({ name: String(row.name), size: Number(row.size) || 0 }));
  }

  async getSchema(_database: string): Promise<Record<string, string[]>> {
    const rows = await this.exec<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_catalog = current_database()
       ORDER BY table_name, ordinal_position`
    );
    const schema: Record<string, string[]> = {};
    for (const row of rows) {
      if (!schema[row.table_name]) schema[row.table_name] = [];
      schema[row.table_name].push(row.column_name);
    }
    return schema;
  }

  async getTableColumns(_database: string, table: string): Promise<ColumnInfo[]> {
    interface PgColumnRow {
      column_name: string;
      data_type: string;
      udt_name: string;
      character_maximum_length: number | null;
      numeric_precision: number | null;
      numeric_scale: number | null;
      is_nullable: string;
      column_default: string | null;
      is_generated: string;
      generation_expression: string | null;
      col_key: string;
    }
    const rows = await this.exec<PgColumnRow>(`
      SELECT
        c.column_name,
        c.data_type,
        c.udt_name,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.is_nullable,
        c.column_default,
        c.is_generated,
        c.generation_expression,
        CASE WHEN pk.column_name IS NOT NULL THEN 'PRI' ELSE '' END as col_key
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku
          ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = $1 AND tc.table_schema = 'public'
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_schema = 'public' AND c.table_name = $1
      ORDER BY c.ordinal_position
    `, [table]);

    return rows.map(row => {
      const dataType = (row.data_type || '').toLowerCase();
      const type = PG_TYPE_MAP[dataType] || (row.udt_name || dataType).toUpperCase();

      let length: string | number | null = null;
      if (row.character_maximum_length != null) {
        length = row.character_maximum_length;
      } else if (row.numeric_precision != null && row.numeric_scale != null && Number(row.numeric_scale) > 0) {
        length = `${row.numeric_precision},${row.numeric_scale}`;
      }

      const isGenerated = row.is_generated === 'ALWAYS';
      const isSerial = row.column_default && String(row.column_default).startsWith('nextval(');

      return {
        name: row.column_name,
        type,
        length,
        nullable: row.is_nullable === 'YES',
        key: row.col_key || '',
        default: isSerial ? null : (row.column_default ?? null),
        extra: isSerial ? 'AUTO_INCREMENT' : (isGenerated ? 'STORED' : ''),
        expression: row.generation_expression || undefined,
        virtuality: isGenerated ? 'STORED' : '',
        unsigned: false,
      };
    });
  }

  async getTableIndexes(_database: string, table: string): Promise<TableIndex[]> {
    interface PgIndexRow {
      index_name: string;
      is_primary: boolean;
      is_unique: boolean;
      column_name: string;
      method: string;
    }
    const rows = await this.exec<PgIndexRow>(`
      SELECT
        i.relname as index_name,
        ix.indisprimary as is_primary,
        ix.indisunique as is_unique,
        a.attname as column_name,
        am.amname as method
      FROM pg_index ix
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      JOIN pg_am am ON am.oid = i.relam
      WHERE t.relname = $1
        AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      ORDER BY i.relname, array_position(ix.indkey, a.attnum)
    `, [table]);

    const indexMap = new Map<string, TableIndex>();
    for (const row of rows) {
      const name = row.index_name;
      if (!indexMap.has(name)) {
        let type = 'INDEX';
        if (row.is_primary) type = 'PRIMARY';
        else if (row.is_unique) type = 'UNIQUE';
        indexMap.set(name, {
          name,
          columns: [],
          unique: Boolean(row.is_unique),
          type,
          method: (row.method || '').toUpperCase(),
        });
      }
      indexMap.get(name)!.columns.push(row.column_name);
    }
    return Array.from(indexMap.values());
  }

  async getTableForeignKeys(_database: string, table: string): Promise<ForeignKey[]> {
    interface PgFkRow {
      name: string;
      column_name: string;
      referenced_table: string;
      referenced_column: string;
      update_rule: string;
      delete_rule: string;
    }
    const rows = await this.exec<PgFkRow>(`
      SELECT
        tc.constraint_name as name,
        kcu.column_name,
        ccu.table_name AS referenced_table,
        ccu.column_name AS referenced_column,
        rc.update_rule,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = $1 AND tc.table_schema = 'public'
      ORDER BY tc.constraint_name, kcu.ordinal_position
    `, [table]);

    const fkMap = new Map<string, ForeignKey>();
    for (const row of rows) {
      const name = row.name;
      if (!fkMap.has(name)) {
        fkMap.set(name, {
          name,
          columns: [],
          referencedTable: row.referenced_table,
          referencedColumns: [],
          updateRule: row.update_rule,
          deleteRule: row.delete_rule,
        });
      }
      fkMap.get(name)!.columns.push(row.column_name);
      fkMap.get(name)!.referencedColumns.push(row.referenced_column);
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
      if (!col.nullable) def += ' NOT NULL';
      if (col.default != null && col.extra !== 'AUTO_INCREMENT') def += ` DEFAULT ${col.default}`;
      return def;
    });

    const constraints: string[] = [];
    if (primaryKey) {
      constraints.push(`  PRIMARY KEY (${primaryKey.columns.map(esc).join(', ')})`);
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

    const colRows = await this.exec<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [table]
    );
    const columns = colRows.map(r => r.column_name);

    const filterParams: unknown[] = [];
    let whereClause = '';

    if (filter && columns.length > 0) {
      const parsed = parseFilter(filter, [' ilike ']);
      if (parsed.isSearch) {
        const searchTerms = columns.map((col, i) => `${esc(col)}::text ILIKE $${i + 1}`).join(' OR ');
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
    const limitIdx = filterParams.length + 1;
    const offsetIdx = filterParams.length + 2;
    const dataParams = [...filterParams, safeLimit, safeOffset];

    const query = `SELECT * FROM ${esc(table)} ${whereClause} ${orderBy} LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    const countQuery = `SELECT COUNT(*) as total FROM ${esc(table)} ${whereClause}`;

    const [dataResult, countResult] = await Promise.all([
      this.execRaw(query, dataParams),
      this.execRaw(countQuery, filterParams),
    ]);

    return {
      columns,
      rows: dataResult.rows,
      total: Number(countResult.rows[0]?.total ?? 0),
    };
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    const result = await this.execRaw(sql);
    // Keyed off the statement kind, not row count: a SELECT matching nothing
    // must still come back as an empty array so callers can render "no rows"
    // rather than an affected-rows summary.
    if (result.command === 'SELECT' || result.command === 'SHOW') return result.rows ?? [];
    return { affectedRows: result.rowCount ?? 0 };
  }

  async addIndex(_database: string, table: string, index: TableIndex): Promise<void> {
    const esc = (n: string) => this.escapeIdentifier(n);
    const cols = index.columns.map(esc).join(', ');
    if (index.type === 'PRIMARY') {
      await this.exec(`ALTER TABLE ${esc(table)} ADD PRIMARY KEY (${cols})`);
    } else if (index.type === 'UNIQUE') {
      const name = esc(index.name || `${table}_${index.columns.join('_')}_key`);
      await this.exec(`CREATE UNIQUE INDEX ${name} ON ${esc(table)} (${cols})`);
    } else {
      const name = esc(index.name || `${table}_${index.columns.join('_')}_idx`);
      await this.exec(`CREATE INDEX ${name} ON ${esc(table)} (${cols})`);
    }
  }

  async addForeignKey(_database: string, table: string, fk: ForeignKey): Promise<void> {
    const esc = (n: string) => this.escapeIdentifier(n);
    const cols = fk.columns.map(esc).join(', ');
    const refCols = fk.referencedColumns.map(esc).join(', ');
    const ALLOWED_FK_RULES = ['CASCADE', 'NO ACTION', 'RESTRICT', 'SET NULL'];
    const updateRule = (fk.updateRule || '').toUpperCase();
    const deleteRule = (fk.deleteRule || '').toUpperCase();
    if (fk.updateRule && !ALLOWED_FK_RULES.includes(updateRule)) throw new Error(`Invalid ON UPDATE rule: ${fk.updateRule}`);
    if (fk.deleteRule && !ALLOWED_FK_RULES.includes(deleteRule)) throw new Error(`Invalid ON DELETE rule: ${fk.deleteRule}`);
    const constraintName = fk.name ? `CONSTRAINT ${esc(fk.name)} ` : '';
    let sql = `ALTER TABLE ${esc(table)} ADD ${constraintName}FOREIGN KEY (${cols}) REFERENCES ${esc(fk.referencedTable)} (${refCols})`;
    if (fk.updateRule) sql += ` ON UPDATE ${updateRule}`;
    if (fk.deleteRule) sql += ` ON DELETE ${deleteRule}`;
    await this.exec(sql);
  }

  async dropIndex(_database: string, table: string, indexName: string): Promise<void> {
    const esc = (n: string) => this.escapeIdentifier(n);
    // Check if it's a constraint (PRIMARY KEY or named UNIQUE constraint)
    const rows = await this.exec(`
      SELECT conname FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE t.relname = $1 AND n.nspname = 'public' AND c.conname = $2
    `, [table, indexName]);
    if (rows.length > 0) {
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
    let sql = `ALTER TABLE ${esc(table)} ADD COLUMN ${esc(column.name)} ${typePart}`;
    if (!column.nullable) sql += ' NOT NULL';
    if (column.default != null) {
      sql += ` DEFAULT ${this.escapeStringLiteral(String(column.default))}`;
    }
    await this.exec(sql);
  }

  async updateColumn(_database: string, table: string, oldColumnName: string, newColumn: ColumnInfo, _afterColumn?: string): Promise<void> {
    const esc = (n: string) => this.escapeIdentifier(n);
    const tbl = esc(table);
    const oldCol = esc(oldColumnName);

    let typePart = newColumn.type;
    if (newColumn.length) typePart += `(${newColumn.length})`;

    await this.exec(`ALTER TABLE ${tbl} ALTER COLUMN ${oldCol} TYPE ${typePart} USING ${oldCol}::text::${typePart}`);

    if (newColumn.nullable) {
      await this.exec(`ALTER TABLE ${tbl} ALTER COLUMN ${oldCol} DROP NOT NULL`);
    } else {
      await this.exec(`ALTER TABLE ${tbl} ALTER COLUMN ${oldCol} SET NOT NULL`);
    }

    if (newColumn.default === null) {
      await this.exec(`ALTER TABLE ${tbl} ALTER COLUMN ${oldCol} DROP DEFAULT`);
    } else if (newColumn.default !== undefined) {
      await this.exec(`ALTER TABLE ${tbl} ALTER COLUMN ${oldCol} SET DEFAULT ${this.escapeStringLiteral(String(newColumn.default))}`);
    }

    if (newColumn.name !== oldColumnName) {
      await this.exec(`ALTER TABLE ${tbl} RENAME COLUMN ${oldCol} TO ${esc(newColumn.name)}`);
    }
  }

  async insertRows(_database: string, table: string, columns: string[], rows: (string | null)[][]): Promise<number> {
    if (rows.length === 0 || columns.length === 0) return 0;
    const colList = columns.map(c => this.escapeIdentifier(c)).join(', ');

    for (const batch of batchRows(rows, columns.length)) {
      const values = buildValuesClause(batch.length, columns.length, i => `$${i + 1}`);
      await this.exec(`INSERT INTO ${this.escapeIdentifier(table)} (${colList}) VALUES ${values}`, batch.flat());
    }
    return rows.length;
  }

  async getSupportedTypes(): Promise<TypeGroup[]> {
    return [
      { group: 'Entero', types: ['SMALLINT', 'INTEGER', 'BIGINT', 'SERIAL', 'BIGSERIAL'] },
      { group: 'Real', types: ['DECIMAL', 'NUMERIC', 'REAL', 'DOUBLE PRECISION'] },
      { group: 'Texto', types: ['CHAR', 'VARCHAR', 'TEXT'] },
      { group: 'Binario', types: ['BYTEA'] },
      { group: 'Tiempo', types: ['DATE', 'TIME', 'TIMETZ', 'TIMESTAMP', 'TIMESTAMPTZ', 'INTERVAL'] },
      { group: 'Booleano', types: ['BOOLEAN'] },
      { group: 'UUID', types: ['UUID'] },
      { group: 'JSON', types: ['JSON', 'JSONB'] },
      { group: 'Red', types: ['INET', 'CIDR', 'MACADDR'] },
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
      maintenanceOps: ['ANALYZE', 'VACUUM'],
      indexTypes: ['PRIMARY', 'UNIQUE', 'INDEX'],
      processIdField: 'pid',
    };
  }

  async getProcessList(): Promise<Record<string, unknown>[]> {
    return this.exec(`
      SELECT pid, usename as "User", client_addr as "Host", datname as "db",
             state as "Command",
             EXTRACT(EPOCH FROM (now() - query_start))::int as "Time",
             state as "State", query as "Info"
      FROM pg_stat_activity
      WHERE pid != pg_backend_pid()
      ORDER BY pid
    `);
  }

  async killProcess(processId: number | string): Promise<void> {
    await this.exec(`SELECT pg_terminate_backend($1)`, [Number(processId)]);
  }

  async getServerVariables(): Promise<ServerVariablesResult> {
    const rows = await this.exec<{ name: string; value: string }>(`SELECT name, setting as value FROM pg_settings ORDER BY name`);
    return {
      variables: rows.map(r => ({ name: r.name, value: String(r.value ?? '') })),
      status: [],
    };
  }

  async runTableMaintenance(_database: string, table: string, op: string): Promise<QueryResult> {
    const esc = (n: string) => this.escapeIdentifier(n);
    return this.executeQuery(`${op.toUpperCase()} ${esc(table)}`);
  }
}
