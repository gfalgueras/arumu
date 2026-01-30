import { IDatabaseDriver, ConnectionConfig, DatabaseInfo, TableInfo, TableDataResponse, SortConfig } from '@shared/types/database';
export declare class MySQLDriver implements IDatabaseDriver {
    private connection;
    connect(config: ConnectionConfig): Promise<void>;
    disconnect(): Promise<void>;
    getDatabases(): Promise<DatabaseInfo[]>;
    getTables(database: string): Promise<TableInfo[]>;
    getSchema(database: string): Promise<Record<string, string[]>>;
    getTableData(database: string, table: string, limit: number, offset: number, sort?: SortConfig[], filter?: string): Promise<TableDataResponse>;
    executeQuery(sql: string): Promise<any>;
}
//# sourceMappingURL=mysql.driver.d.ts.map