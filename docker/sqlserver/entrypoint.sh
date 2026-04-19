#!/bin/bash
# Start SQL Server in the background then run the init script once it's ready.
/opt/mssql/bin/sqlservr &
MSSQL_PID=$!

echo "Waiting for SQL Server to accept connections..."
for i in $(seq 1 60); do
  /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "Arumu_Test1" -C -Q "SELECT 1" > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "SQL Server is ready (attempt $i)"
    break
  fi
  echo "  attempt $i — not ready yet, retrying in 2s..."
  sleep 2
done

echo "Running init script..."
/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "Arumu_Test1" -C -i /init.sql
echo "Init script complete."

wait $MSSQL_PID
