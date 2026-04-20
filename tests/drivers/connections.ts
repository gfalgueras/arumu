import type { ConnectionConfig } from '@shared/types/database';

const e = (key: string, fallback: string) => process.env[key] || fallback;

export const connections: Record<string, ConnectionConfig> = {
  mysql: {
    host:     e('TEST_MYSQL_HOST', '127.0.0.1'),
    port:     Number(e('TEST_MYSQL_PORT', '3306')),
    user:     e('TEST_MYSQL_USER', 'root'),
    password: e('TEST_MYSQL_PASSWORD', 'root'),
    database: e('TEST_MYSQL_DB', 'arumu_test'),
  },
  postgres: {
    host:     e('TEST_PG_HOST', '127.0.0.1'),
    port:     Number(e('TEST_PG_PORT', '5432')),
    user:     e('TEST_PG_USER', 'arumu'),
    password: e('TEST_PG_PASSWORD', 'arumu'),
    database: 'arumu_test',
  },
  sqlserver: {
    host:     e('TEST_MSSQL_HOST', '127.0.0.1'),
    port:     Number(e('TEST_MSSQL_PORT', '1433')),
    user:     e('TEST_MSSQL_USER', 'sa'),
    password: e('TEST_MSSQL_PASSWORD', 'Arumu_Test1'),
    database: 'arumu_test',
  },
  oracle: {
    host:     e('TEST_ORACLE_HOST', '127.0.0.1'),
    port:     Number(e('TEST_ORACLE_PORT', '1521')),
    user:     e('TEST_ORACLE_USER', 'arumu_test'),
    password: e('TEST_ORACLE_PASSWORD', 'arumu_test'),
    database: e('TEST_ORACLE_SERVICE', 'XEPDB1'),
  },
  sqlite: {
    host: ':memory:',
    port: 0,
    user: '',
  },
};
