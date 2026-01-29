export interface TableInfo {
    name: string;
}
export interface DatabaseInfo {
    name: string;
    tables: TableInfo[];
}
export interface ServerInfo {
    id: string;
    name: string;
    type: 'mysql' | 'postgres' | 'sqlite';
    databases: DatabaseInfo[];
    config?: ConnectionConfig;
}
export interface StoredServer {
    id: string;
    name: string;
    type: 'mysql' | 'postgres' | 'sqlite';
    config: ConnectionConfig;
}
export interface ConnectionConfig {
    host: string;
    port: number;
    user: string;
    password?: string;
    database?: string;
}
export interface IDatabaseDriver {
    connect(config: ConnectionConfig): Promise<void>;
    disconnect(): Promise<void>;
    getDatabases(): Promise<DatabaseInfo[]>;
    getTables(database: string): Promise<TableInfo[]>;
    executeQuery(sql: string): Promise<any>;
}
//# sourceMappingURL=database.d.ts.map