# Antbox API Documentation

## Table of Contents

1. [Overview](#overview)
2. [Endpoints](#endpoints)
   - [Nodes API](#nodes-api)
   - [Actions API](#actions-api)
   - [Aspects API](#aspects-api)
   - [Extensions API](#extensions-api)
   - [File Upload API](#file-upload-api)
   - [Login API](#login-api)
3. [Authentication & Authorization](#authentication--authorization)

## Overview

This document describes the REST API for the Antbox system. It outlines the available endpoints, their responsibilities, and the expected inputs and outputs for each.

## Endpoints

### Nodes API

Base path: `/nodes`

| Endpoint             | HTTP Method | Description                  |
| -------------------- | ----------- | ---------------------------- |
| `/:uuid`             | GET         | Fetch a node by its UUID     |
| `/:uuid/-/export`    | GET         | Export a node by its UUID    |
| `/:uuid/-/duplicate` | GET         | Duplicate a node by its UUID |
| `/:uuid/-/evaluate`  | GET         | Evaluate a node by its UUID  |
| `/`                  | GET         | List nodes                   |
| `/`                  | POST        | Create a new node            |
| `/:uuid/-/copy`      | POST        | Copy a node by its UUID      |
| `/-/query`           | POST        | Query nodes with filters     |
| `/:uuid`             | PATCH       | Update a node by its UUID    |
| `/:uuid`             | DELETE      | Delete a node by its UUID    |

### Actions API

Base Path: `/actions`

| Method | Path           | Description                                        | Query Parameters          |
| ------ | -------------- | -------------------------------------------------- | ------------------------- |
| `GET`  | `/`            | Retrieve a list of all actions.                    |                           |
| `GET`  | `/:uuid`       | Retrieve details of a specific action by its UUID. |                           |
| `GET`  | `/:uuid/-/run` | Trigger the execution of a specific action.        | `uuids` (comma-separated) |

### Aspects API

Base Path: `/aspects`

| Method | Path     | Description                                        |
| ------ | -------- | -------------------------------------------------- |
| `GET`  | `/`      | Retrieve a list of all aspects.                    |
| `GET`  | `/:uuid` | Retrieve details of a specific aspect by its UUID. |

### Extensions API

Base Path: `/ext`

| Method | Path     | Description                                                  |
| ------ | -------- | ------------------------------------------------------------ |
| `GET`  | `/:uuid` | Trigger the execution of a specific extension (GET method).  |
| `POST` | `/:uuid` | Trigger the execution of a specific extension (POST method). |

### File Upload API

Base path: (Not explicitly defined in provided code, assuming as an extension of Nodes API)

| Endpoint                   | HTTP Method | Description                    |
| -------------------------- | ----------- | ------------------------------ |
| `/upload/createFile`       | POST        | Create a new node file         |
| `/upload/updateFile/:uuid` | POST        | Update a node file by its UUID |

### Login API

Base Path: `/login`

| Method | Path    | Description                    |
| ------ | ------- | ------------------------------ |
| `POST` | `/root` | Authenticate as the root user. |

## Authentication & Authorization

For the majority of the APIs, authentication and authorization are critical. The system uses JWTs (JSON Web Tokens) for this purpose. Here are the steps involved:

1. **Fetching the JWT**:
   - Clients can authenticate as the root user by making a `POST` request to the `/login/root` endpoint with the correct password.
   - Upon successful authentication, a JWT is returned in the response.

2. **Sending the JWT**:
   - Once obtained, the JWT should be included in the `x-access-token` header of subsequent API requests.
   - The system will verify the JWT to ensure it's valid and hasn't expired. If the JWT is invalid or has expired, the request will be denied.

3. **Tenant Information**:
   - Requests should also include tenant information in the `x-tenant` header. If no tenant is specified, the system defaults to the first tenant in the configuration.

4. **User Information**:
   - Once a JWT is verified, the system extracts the user's details and attaches them to the request context. This allows for fine-grained access control based on the user's roles and permissions.

Ensure that you keep your JWTs safe and never expose them in client-side scripts or other insecure locations.

```
```
