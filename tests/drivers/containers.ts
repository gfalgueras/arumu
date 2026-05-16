import { resolve } from 'path'
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { MSSQLServerContainer, type StartedMSSQLServerContainer } from '@testcontainers/mssqlserver'
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'
import type { ConnectionConfig } from '@shared/types/database'

const DOCKER_DIR = resolve(__dirname, '../../docker')

export interface StartedContainer<T> {
  container: T
  config: ConnectionConfig
  stop: () => Promise<void>
}

export async function startMySQL(): Promise<StartedContainer<StartedMySqlContainer>> {
  const container = await new MySqlContainer('mysql:8.0')
    .withRootPassword('root')
    .withCopyFilesToContainer([{
      source: resolve(DOCKER_DIR, 'mysql/init.sql'),
      target: '/docker-entrypoint-initdb.d/init.sql',
    }])
    .start()

  return {
    container,
    config: {
      host: container.getHost(),
      port: container.getMappedPort(3306),
      user: 'root',
      password: 'root',
      database: 'arumu_test',
    },
    stop: () => container.stop(),
  }
}

export async function startPostgres(): Promise<StartedContainer<StartedPostgreSqlContainer>> {
  const container = await new PostgreSqlContainer('postgres:15')
    .withDatabase('arumu_test')
    .withUsername('arumu')
    .withPassword('arumu')
    .withCopyFilesToContainer([{
      source: resolve(DOCKER_DIR, 'postgres/init.sql'),
      target: '/docker-entrypoint-initdb.d/init.sql',
    }])
    .start()

  return {
    container,
    config: {
      host: container.getHost(),
      port: container.getMappedPort(5432),
      user: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
    },
    stop: () => container.stop(),
  }
}

const MSSQL_PASSWORD = 'Arumu_Test1'

export async function startSQLServer(): Promise<StartedContainer<StartedMSSQLServerContainer>> {
  const container = await new MSSQLServerContainer('mcr.microsoft.com/mssql/server:2022-latest')
    .acceptLicense()
    .withPassword(MSSQL_PASSWORD)
    .start()

  await container.copyFilesToContainer([{
    source: resolve(DOCKER_DIR, 'sqlserver/init.sql'),
    target: '/tmp/init.sql',
  }])

  // sqlcmd path differs between 2019 and 2022; try both
  const sqlcmdPaths = [
    '/opt/mssql-tools18/bin/sqlcmd',
    '/opt/mssql-tools/bin/sqlcmd',
  ]
  let ran = false
  for (const bin of sqlcmdPaths) {
    const result = await container.exec([bin, '-S', 'localhost', '-U', 'sa', '-P', MSSQL_PASSWORD, '-i', '/tmp/init.sql', '-C', '-b'])
    if (result.exitCode === 0) { ran = true; break }
  }
  if (!ran) throw new Error('sqlcmd not found in container — init SQL not applied')

  return {
    container,
    config: {
      host: container.getHost(),
      port: container.getMappedPort(1433),
      user: 'sa',
      password: MSSQL_PASSWORD,
      database: 'arumu_test',
    },
    stop: () => container.stop(),
  }
}

export async function startOracle(): Promise<StartedContainer<StartedTestContainer>> {
  const container = await new GenericContainer('gvenzl/oracle-free:23-slim-faststart')
    .withEnvironment({
      ORACLE_PASSWORD: 'oracle',
      APP_USER: 'arumu_test',
      APP_USER_PASSWORD: 'arumu_test',
    })
    .withExposedPorts(1521)
    .withWaitStrategy(Wait.forLogMessage('DATABASE IS READY TO USE!'))
    .withStartupTimeout(180_000)
    .start()

  return {
    container,
    config: {
      host: container.getHost(),
      port: container.getMappedPort(1521),
      user: 'arumu_test',
      password: 'arumu_test',
      database: 'FREEPDB1',
    },
    stop: () => container.stop(),
  }
}
