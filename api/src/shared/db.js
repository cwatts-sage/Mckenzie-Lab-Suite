const { TableClient, TableServiceClient } = require('@azure/data-tables');

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
if (!connectionString) {
  throw new Error('AZURE_STORAGE_CONNECTION_STRING environment variable is required');
}

const tables = {};

async function getTable(tableName) {
  if (!tables[tableName]) {
    const client = TableClient.fromConnectionString(connectionString, tableName);
    try {
      await client.createTable();
    } catch (e) {
      // Table might already exist — that's fine
      if (e.statusCode !== 409) throw e;
    }
    tables[tableName] = client;
  }
  return tables[tableName];
}

module.exports = { getTable };
