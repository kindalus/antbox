# Antbox tools and utilities

Antbox provides a set of tools and utilities to help you manage your Antbox server and data. These tools can be used to perform various tasks such as data import/export, nodes management, and more.

## 1. Data Migration Tool

The Data Migration Tool allows you to import and export data from your Antbox server. This tool can be useful when migrating data between different instances or when backing up your data.

### Usage

To use the Data Migration Tool, run the following command:

```shell
deno run --allow-read --allow-write tools/data_migration.ts <path/to/config.json>
```

The `config.json` file should contain the necessary configuration for the data migration process. You can specify the source and destination databases, as well as any other options required for the migration.

Here is an example of a `config.json` file:

```json
{
  "src": {
    "repository": ["pouchdb/pouchdb_node_repository.ts", "/path/to/src/db"],
    "storage": ["s3/s3_storage_provider.ts", "/path/to/src/s3_config.json"]
  },

  "dest": {
    "repository": [
      "mongodb/mongodb_node_repository.ts",
      "mongodb://localhost/db"
    ],
    "storage": ["s3/s3_storage_provider.ts", "/path/to/dest/s3_config.json"]
  }
}
```
