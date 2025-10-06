# Storage Providers

Antbox uses storage providers to store and retrieve files. Storage providers are pluggable, which means you can easily swap them out without affecting the core business logic of the application.

Antbox comes with several built-in storage providers:

*   **In-memory:** Stores files in memory. This is great for development and testing, but it is not recommended for production use.
*   **File system:** Stores files on the local file system.
*   **Google Drive:** Stores files in Google Drive.
*   **S3:** Stores files in an S3-compatible object store.

## Configuring Storage Providers

Storage providers are configured in the `antbox.toml` file. Each tenant can have its own storage provider configuration.

Here is an example of how to configure the file system storage provider:

```toml
[[tenants]]
id = "default"

[tenants.storage]
provider = "fs"
path = "/path/to/storage"
```

This configuration tells Antbox to use the file system storage provider for the `default` tenant and to store files in the `/path/to/storage` directory.

### In-memory

The in-memory storage provider does not require any configuration.

```toml
[tenants.storage]
provider = "inmem"
```

### Google Drive

To use the Google Drive storage provider, you will need to create a service account in the Google Cloud Platform and download a JSON key file.

```toml
[tenants.storage]
provider = "gdrive"
keyFile = "/path/to/keyfile.json"
folderId = "<google-drive-folder-id>"
```

### S3

To use the S3 storage provider, you will need to provide your S3 credentials and the name of the bucket to use.

```toml
[tenants.storage]
provider = "s3"
bucket = "<your-s3-bucket>"
accessKeyID = "<your-access-key-id>"
secretAccessKey = "<your-secret-access-key>"
region = "<your-aws-region>"
endpoint = "<your-s3-endpoint>" # Optional
```
