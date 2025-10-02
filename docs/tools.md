# Antbox Tools and Utilities

Antbox provides a collection of command-line tools and utilities to help you manage your Antbox
server, migrate data, and perform administrative tasks. These tools are designed to work with the
pluggable provider architecture and support various deployment scenarios.

## Table of Contents

- [Overview](#overview)
- [Data Migration Tool](#data-migration-tool)
- [Server Utilities](#server-utilities)
- [Development Tools](#development-tools)
- [Configuration Examples](#configuration-examples)

## Overview

Antbox tools are built with Deno and follow the same architectural principles as the main system.
They leverage the provider abstraction to work consistently across different storage backends and
repository implementations.

## Data Migration Tool

The Data Migration Tool allows you to migrate content and metadata between different Antbox
configurations, enabling upgrades, backup restoration, and deployment changes.

### Usage

```bash
deno run --allow-read --allow-write --allow-net tools/data_migration.ts <path/to/config.json>
```

### Migration Configuration

The migration tool uses a JSON configuration file that specifies source and destination providers:

```json
{
	"src": {
		"repository": ["provider_module", "config_param1", "config_param2"],
		"storage": ["provider_module", "config_param1", "config_param2"]
	},
	"dst": {
		"repository": ["provider_module", "config_param1", "config_param2"],
		"storage": ["provider_module", "config_param1", "config_param2"]
	}
}
```

### Migration Process

The tool performs a complete migration including:

1. **System Folders**: Root, System, Users, Groups, Aspects, Features, etc.
2. **Metadata Migration**: All node metadata and relationships
3. **Content Migration**: Binary content for file nodes
4. **Hierarchical Structure**: Maintains folder hierarchy and permissions
5. **Validation**: Ensures data integrity during migration

### Supported Migration Scenarios

#### Local to Cloud Migration

```json
{
	"src": {
		"repository": [
			"flat_file/flat_file_node_repository.ts",
			"/local/data/repository"
		],
		"storage": [
			"flat_file/flat_file_storage_provider.ts",
			"/local/data/storage"
		]
	},
	"dst": {
		"repository": [
			"mongodb/mongodb_node_repository.ts",
			"mongodb://prod-cluster/antbox"
		],
		"storage": ["s3/s3_storage_provider.ts", "/config/prod_s3_config.json"]
	}
}
```

#### Database Upgrade Migration

```json
{
	"src": {
		"repository": ["pouchdb/pouchdb_node_repository.ts", "/old/pouchdb"],
		"storage": ["flat_file/flat_file_storage_provider.ts", "/data/storage"]
	},
	"dst": {
		"repository": [
			"mongodb/mongodb_node_repository.ts",
			"mongodb://localhost:27017/antbox"
		],
		"storage": ["flat_file/flat_file_storage_provider.ts", "/data/storage"]
	}
}
```

#### Backup and Restore

```json
{
	"src": {
		"repository": [
			"mongodb/mongodb_node_repository.ts",
			"mongodb://prod/antbox"
		],
		"storage": ["s3/s3_storage_provider.ts", "/config/prod_s3.json"]
	},
	"dst": {
		"repository": [
			"flat_file/flat_file_node_repository.ts",
			"/backup/repository"
		],
		"storage": ["flat_file/flat_file_storage_provider.ts", "/backup/storage"]
	}
}
```

### Migration Features

- **Incremental Migration**: Skips existing content to resume interrupted migrations
- **Error Handling**: Detailed error reporting and recovery options
- **Progress Tracking**: Real-time progress updates and completion statistics
- **Data Validation**: Integrity checks during and after migration
- **Cross-Platform**: Works across different operating systems and architectures

## Server Utilities

### Demo Server

The demo server provides a quick way to start Antbox with persistent storage:

```bash
# Start with default settings
deno run --allow-read --allow-write --allow-net src/demo.ts

# Specify data directory
deno run --allow-read --allow-write --allow-net src/demo.ts /path/to/data

# Custom port and password
deno run --allow-read --allow-write --allow-net src/demo.ts --port 8080 --passwd mypassword

# Show help
deno run --allow-read --allow-write --allow-net src/demo.ts --help
```

### Sandbox Server

The sandbox server runs completely in memory for development and testing:

```bash
# Start sandbox server
deno run --allow-net src/sandbox.ts

# Custom port and password
deno run --allow-net src/sandbox.ts --port 9000 --passwd testpass

# Show server keys for debugging
deno run --allow-net src/sandbox.ts --keys

# Show help
deno run --allow-net src/sandbox.ts --help
```

### Server Key Utilities

Generate and display cryptographic keys used by the server:

```bash
# Print server keys with default password
deno run --allow-read src/print_server_keys.ts

# Print keys with custom password
deno run --allow-read src/print_server_keys.ts --passwd custom_password
```

This tool displays:

- JWK (JSON Web Key) for JWT signing
- Public key for verification
- Symmetric encryption keys
- Key fingerprints

## Development Tools

### API Testing

Run comprehensive API tests against a running server:

```bash
# Run all API tests
deno run --allow-net src/api_tests.ts

# Test specific endpoints
deno run --allow-net src/api_tests.ts --filter nodes
```

### Provider Contract Tests

Validate custom provider implementations:

```bash
# Test all node repository implementations
deno task test-node-repository

# Test all storage provider implementations
deno task test-storage-provider
```

### Database Provider Tests

Run specific database tests:

```bash
# Test MongoDB repository
deno run -A src/adapters/run_node_repository_tests.ts mongodb

# Test PouchDB repository
deno run -A src/adapters/run_node_repository_tests.ts pouchdb

# Test storage providers
deno run -A src/adapters/run_storage_provider_tests.ts s3
```

## Configuration Examples

### Complete Migration Workflow

1. **Prepare Configuration**:

```json
{
	"src": {
		"repository": ["flat_file/flat_file_node_repository.ts", "/current/repo"],
		"storage": ["flat_file/flat_file_storage_provider.ts", "/current/storage"]
	},
	"dst": {
		"repository": [
			"mongodb/mongodb_node_repository.ts",
			"mongodb://localhost/antbox_new"
		],
		"storage": ["s3/s3_storage_provider.ts", "/config/s3_config.json"]
	}
}
```

2. **Validate Source Data**:

```bash
# Start source server to verify data integrity
deno run --allow-read --allow-write --allow-net src/demo.ts /current
```

3. **Prepare Destination**:

```bash
# Ensure MongoDB is running
mongod --dbpath /data/mongodb

# Ensure S3 bucket exists and is accessible
aws s3 ls s3://your-antbox-bucket
```

4. **Run Migration**:

```bash
deno run --allow-read --allow-write --allow-net tools/data_migration.ts migration_config.json
```

5. **Verify Migration**:

```bash
# Start server with new configuration
deno run --allow-read --allow-write --allow-net src/demo.ts \
  --config new_server_config.json
```

### Development Workflow

1. **Start Development Server**:

```bash
# In-memory server for rapid development
deno run --allow-net src/sandbox.ts --passwd dev123
```

2. **Test API Changes**:

```bash
# Run API tests
deno run --allow-net src/api_tests.ts
```

3. **Migrate to Persistent Storage**:

```bash
# Create migration config
cat > dev_to_persistent.json << EOF
{
  "src": {
    "repository": ["inmem/inmem_node_repository.ts"],
    "storage": ["inmem/inmem_storage_provider.ts"]
  },
  "dst": {
    "repository": ["flat_file/flat_file_node_repository.ts", "/dev/data/repo"],
    "storage": ["flat_file/flat_file_storage_provider.ts", "/dev/data/storage"]
  }
}
EOF

# Run migration
deno run --allow-read --allow-write tools/data_migration.ts dev_to_persistent.json
```

### Production Deployment

1. **Backup Current System**:

```json
{
	"src": {
		"repository": [
			"mongodb/mongodb_node_repository.ts",
			"mongodb://prod/antbox"
		],
		"storage": ["s3/s3_storage_provider.ts", "/config/prod_s3.json"]
	},
	"dst": {
		"repository": [
			"flat_file/flat_file_node_repository.ts",
			"/backup/$(date +%Y%m%d)/repo"
		],
		"storage": [
			"flat_file/flat_file_storage_provider.ts",
			"/backup/$(date +%Y%m%d)/storage"
		]
	}
}
```

2. **Validate Backup**:

```bash
# Test backup integrity
deno run --allow-read --allow-write --allow-net src/demo.ts /backup/$(date +%Y%m%d)
```

3. **Deploy Updates**:

```bash
# Update Antbox code
git pull origin main

# Restart production server
systemctl restart antbox
```

## Best Practices

### Migration Best Practices

1. **Always backup** before migration
2. **Test migrations** on non-production data first
3. **Verify data integrity** after migration
4. **Monitor disk space** during large migrations
5. **Use appropriate permissions** for file system access
6. **Plan for downtime** during production migrations

### Tool Usage Tips

1. **Use specific permissions**: Only grant necessary --allow flags
2. **Monitor resources**: Watch memory and disk usage during operations
3. **Log operations**: Redirect output to log files for large operations
4. **Validate configurations**: Test provider configurations before migration
5. **Keep backups**: Maintain multiple backup copies for critical data

### Security Considerations

1. **Protect configuration files**: Store sensitive configs securely
2. **Use environment variables**: For credentials and sensitive parameters
3. **Limit access**: Restrict file system permissions appropriately
4. **Audit operations**: Log all administrative operations
5. **Secure connections**: Use encrypted connections for database access

---

These tools provide the foundation for managing Antbox deployments across different environments and
scales, from development through production operations.
