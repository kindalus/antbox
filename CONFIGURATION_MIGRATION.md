# Configuration Migration Guide

This document describes the new configuration-driven server architecture implemented in Antbox.

## Overview

Antbox now uses a unified entry point (`main.ts`) with TOML-based configuration files, replacing the previous demo.ts and sandbox.ts entry points. This change provides better deployment flexibility, easier multi-tenant configuration, and cleaner separation between code and configuration.

## Breaking Changes

### Entry Point Change

- **Before**: `deno run src/demo.ts [dir] --port 8080`
- **After**: `deno run main.ts --demo` or `deno run main.ts -f .config/demo.toml`

### Configuration Structure

- **Before**: Hardcoded configuration in TypeScript files
- **After**: TOML configuration files in `.config/` directory

## New Architecture

### Main Entry Point

- **File**: `main.ts`
- **Purpose**: Unified server entry point with configuration loading
- **Arguments**:
  - `--keys`: Print crypto keys and exit
  - `-f <file>`: Override configuration file (default: `.config/antbox.toml`)
  - `--demo`: Use demo configuration
  - `--sandbox`: Use sandbox configuration

### Configuration Files

#### Default Configuration (`.config/antbox.toml`)

```toml
engine = "oak"
port = 7180

[[tenants]]
name = "production"
rootPasswd = "secure_password"
key = "./.config/antbox.key"
jwk = "./.config/antbox.jwk"
storage = ["s3/s3_storage_provider.ts", "/path/to/s3_config.json"]
repository = ["mongodb/mongodb_node_repository.ts", "mongodb://localhost:27017/antbox"]
```

#### Demo Configuration (`.config/demo.toml`)

```toml
engine = "oak"
port = 7180

[[tenants]]
name = "demo"
rootPasswd = "demo"
key = "./.config/antbox.key"
jwk = "./.config/antbox.jwk"
storage = ["flat_file/flat_file_storage_provider.ts", "./data/storage"]
repository = ["flat_file/flat_file_node_repository.ts", "./data/repository"]
```

#### Sandbox Configuration (`.config/sandbox.toml`)

```toml
engine = "oak"
port = 7180

[[tenants]]
name = "sandbox"
rootPasswd = "demo"
key = "./.config/antbox.key"
jwk = "./.config/antbox.jwk"
storage = ["inmem/inmem_storage_provider.ts"]
repository = ["inmem/inmem_node_repository.ts"]
```

### Key Features

#### Engine Selection

- **Oak**: Default HTTP server framework
- **H3**: Alternative high-performance server
- Configuration: `engine = "oak"` or `engine = "h3"`

#### Flexible Key Management

- **Direct values**: `key = "ui2tPcQZvN+IxXsEW6KQOOFROS6zXB1pZdotBR3Ot8o="`
- **File paths**: `key = "./.config/antbox.key"`
- **URL support**: `jwk = "https://example.com/keys/antbox.jwk"`

#### Multi-Tenant Support

Multiple tenant configurations in single file:

```toml
[[tenants]]
name = "tenant1"
# ... configuration

[[tenants]]
name = "tenant2"
# ... configuration
```

## Migration Steps

### 1. Update Entry Point

Replace existing server startup commands:

```bash
# Old way
deno run --allow-net --allow-read src/demo.ts ./data

# New way
deno run --allow-net --allow-read --allow-write --allow-env main.ts --demo
# or
./start_server.sh --demo
```

### 2. Create Configuration Files

Copy and customize the provided configuration templates in `.config/`:

- `antbox.toml` - Production configuration
- `demo.toml` - Development configuration
- `sandbox.toml` - Testing configuration

### 3. Update Deployment Scripts

Replace hardcoded TypeScript configurations with TOML files:

```bash
#!/bin/bash
# Production deployment
deno run --allow-net --allow-read --allow-write --allow-env main.ts -f production.toml

# Development
deno run --allow-net --allow-read --allow-write --allow-env main.ts --demo

# Testing
deno run --allow-net --allow-read --allow-write --allow-env main.ts --sandbox
```

## Configuration Reference

### Root Level Options

- `engine`: HTTP server engine ("oak" or "h3")
- `port`: Server port (default: 7180)

### Tenant Configuration

- `name`: Tenant identifier
- `rootPasswd`: Root user password
- `key`: Symmetric encryption key (file path or direct value)
- `jwk`: JSON Web Key path or URL
- `storage`: Storage provider configuration `[module, ...params]`
- `repository`: Repository provider configuration `[module, ...params]`

### Storage Providers

- **In-Memory**: `["inmem/inmem_storage_provider.ts"]`
- **Flat File**: `["flat_file/flat_file_storage_provider.ts", "/path/to/storage"]`
- **S3**: `["s3/s3_storage_provider.ts", "/path/to/s3_config.json"]`
- **Google Drive**: `["googledrive/googledrive_storage_provider.ts", "/path/to/credentials.json"]`

### Repository Providers

- **In-Memory**: `["inmem/inmem_node_repository.ts"]`
- **Flat File**: `["flat_file/flat_file_node_repository.ts", "/path/to/repository"]`
- **MongoDB**: `["mongodb/mongodb_node_repository.ts", "mongodb://localhost:27017/antbox"]`
- **PouchDB**: `["pouchdb/pouchdb_node_repository.ts", "/path/to/database"]`

## Shell Script Wrapper

The `start_server.sh` script provides the same interface as `main.ts`:

```bash
# All main.ts arguments are supported
./start_server.sh --keys
./start_server.sh --demo
./start_server.sh --sandbox
./start_server.sh -f custom.toml
```

## Legacy Support

The original `demo.ts` and `sandbox.ts` files remain functional but are deprecated:

- Display deprecation warnings
- Redirect users to new `main.ts` entry point
- Will be removed in future versions

## Benefits

1. **Cleaner Separation**: Configuration separate from application code
2. **Environment Management**: Easy switching between dev/staging/production
3. **Multi-Tenancy**: Multiple tenants in single configuration file
4. **Deployment Flexibility**: Same binary, different configurations
5. **Key Management**: Support for files, direct values, and URLs
6. **Engine Choice**: Easy switching between Oak and H3 servers

## Troubleshooting

### Configuration Not Found

```
Configuration file not found: ./.config/antbox.toml
```

**Solution**: Create configuration file or specify existing one with `-f`

### Invalid TOML Syntax

**Solution**: Validate TOML syntax using online validators or `deno run` with syntax checking

### Key Loading Errors

**Solution**: Verify key file paths and permissions, check URL accessibility for remote JWK

### Missing Storage/Repository Modules

**Solution**: Ensure provider modules exist in `src/adapters/` directory

## Support

- Legacy entry points: Supported with deprecation warnings
- Configuration validation: Built into `main.ts` startup process
- Error messages: Detailed feedback for configuration issues
