# Antbox Storage and Persistence Providers

Project Antbox is a lightweight ECM server that offers flexibility in storage and persistence options. By implementing the NodeRepository or StorageProvider interfaces, you can define your own storage mechanisms. This document outlines the provided solutions and gives examples of their usage.

## Table of Contents

- [How to Use](#how-to-use)
- [Available Implementations](#available-implementations)
  - [1. Flat File Node Repository](#1-flat-file-node-repository)
  - [2. Flat File Storage Provider](#2-flat-file-storage-provider)
  - [3. Google Drive Storage Provider](#3-google-drive-storage-provider)
  - [4. Mongodb Node Repository](#4-mongodb-node-repository)
  - [5. PouchDB Node Repository](#5-pouchdb-node-repository)
- [Interfaces](#interfaces)

## How to Use

To use any of the defined storage or persistence providers, follow the example:

```typescript
startServer({
	port: program.options.port ? parseInt(program.options.port) : undefined,
	tenants: [
		{
			name: "demo",
			rootPasswd: "secret",
			storage: [
				"flat_file/flat_file_storage_provider.ts",
				"/var/lib/data",
			],
			repository: [
				"pouchdb/pouchdb_node_repository.ts",
				"/var/lib/db",
			],
		},
	],
});
```

Providers can be referenced by path relative to the folder "src/adapters" or by using a fully qualified file location.

## Available Implementations

### 1. Flat File Node Repository

- **Description**: Utilizes a JSON file (`nodes_repo.json`) to maintain node records.
- **Path**: `flat_file/flat_file_node_repository.ts`

**Usage Example**:

```typescript
{
  name: "myTenant",
  rootPasswd: "myPassword",
  repository: [
    "flat_file/flat_file_node_repository.ts",
    "/path/to/repository/directory"
  ]
}
```

### 2. Flat File Storage Provider

- **Description**: Uses the file system for data storage.
- **Path**: `flat_file/flat_file_storage_provider.ts`

**Usage Example**:

```typescript
{
  name: "myTenant",
  rootPasswd: "myPassword",
  storage: [
    "flat_file/flat_file_storage_provider.ts",
    "/path/to/storage/directory"
  ]
}
```

### 3. Google Drive Storage Provider

- **Description**: Store data on Google Drive. Ideal for cloud-based applications and for data accessibility across devices.
- **Path**: "google_drive/google_drive_storage_provider.ts"

**Usage Example**:

```typescript
{
  name: "myTenant",
  rootPasswd: "myPassword",
  storage: [
    "path_to_google_drive_storage_provider.ts",
    "/path/to/google_drive_api_key"
    "root_folder_id"
  ]
}
```

#### 3.1. How to create the credentials file to access Google Drive API using Node.js googleapis package

To create a credentials file to access the Google Drive API using the Node.js googleapis package, you will need to:

1. Create a service account in the Google Cloud Platform Console.
2. Enable the Google Drive API for your project.
3. Download the JSON key file for your service account.

**Steps:**

1. **Create a service account**
   - Go to the Google Cloud Platform Console.
   - Click the **hamburger menu** (three lines) in the top left corner of the page.
   - Select **IAM & Admin**.
   - Under **Service accounts**, click **Create Service Account**.
   - Enter a name and description for your service account.
   - Select the **Role** for your service account. For most cases, the **Editor** role is sufficient.
   - Click **Create and Continue**.
   - On the **Grant this service account access to project** page, select the **project** that you want to grant access to.
   - Click **Continue**.

2. **Enable the Google Drive API**
   - Go to the Google Cloud Platform Console.
   - Click the **hamburger menu** (three lines) in the top left corner of the page.
   - Select **APIs & Services**.
   - Click **Library**.
   - Search for "Google Drive API" and click on it.
   - Click **Enable**.

3. **Download the JSON key file for your service account**
   - Go to the Google Cloud Platform Console.
   - Click the **hamburger menu** (three lines) in the top left corner of the page.
   - Select **IAM & Admin**.
   - Under **Service accounts**, click on the name of the service account that you created.
   - Click the **Keys** tab.
   - Click the **Add Key** button and select **JSON** as the key type.
   - Click **Create**.
   - A JSON key file will be downloaded to your computer. Save this file in a safe place.

**Once you have completed all of these steps, you will have a credentials file that you can use to access the Google Drive API using the Node.js googleapis package.**

For more information on how to use the Google Drive API, please see the official documentation: https://developers.google.com/drive/api/guides/about-sdk.

### 4. MongoDB Node Repository

- **Description**: Leverages MongoDB for node persistence. Suitable for larger applications with a need for scale.
- **Path**: `mongodb/mongodb_node_repository.ts`

**Usage Example**:

```typescript
{
  name: "myTenant",
  rootPasswd: "myPassword",
  repository: [
    "mongodb/mongodb_node_repository.ts",
    "mongodb://localhost:27017/mydatabase"
  ]
}
```

### 5. PouchDB Node Repository

- **Description**: Uses PouchDB, a JavaScript database inspired by CouchDB, for node persistence. This implementation provides an offline-first database solution, allowing applications to store data locally and synchronize with compatible servers when online.
- **Path**: `pouchdb/pouchdb_node_repository.ts`

**Usage Example**:

```typescript
{
  name: "myTenant",
  rootPasswd: "myPassword",
  repository: [
    "pouchdb/pouchdb_node_repository.ts",
    "/path/to/db"
  ]
}
```

#### Limitations:

⚠️ **Warning**: The PouchDB Node Repository does **not** work on ARM macOS.

---

With the PouchDB Node Repository, Antbox offers an offline-first solution which can be particularly useful for applications that might not always have a reliable internet connection but still need a robust database solution. This way, data can be stored locally and synced when online connectivity is restored.

## Interfaces

For developers seeking to build custom implementations, the two main interfaces to consider are:

1. `StorageProvider`: Defines methods for writing, reading, and deleting data.
2. `NodeRepository`: Provides methods to add, update, delete, retrieve, and filter nodes.

Refer to the provided source code for method details and structure.

---

With these defined providers, Project Antbox aims to offer flexibility and adaptability for different storage and persistence needs. By adhering to the outlined interfaces, you can even define your custom solutions to fit your specific requirements.
