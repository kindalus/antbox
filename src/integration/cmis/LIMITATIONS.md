# CMIS Server Implementation Limitations

This document outlines the limitations of the current CMIS server implementation (Browser Binding).

## Scope of Implementation

The current CMIS server implements a subset of the CMIS Browser Binding operations.

**Implemented Operations:**
*   `getRepositoryInfo`
*   `getRepositories`
*   `getChildren`
*   `getObject` (for properties)
*   `getContentStream`
*   `createDocument`
*   `createFolder`
*   `deleteObject`

**Missing Operations:**
Many CMIS operations are not yet implemented, including but not limited to:
*   **Navigation Services:** `getDescendants`, `getFolderParent`, `getFolderTree`.
*   **Object Services:** `updateProperties`, `setContentStream`, `moveObject`, `copyObject`, `checkOut`, `checkIn`, `cancelCheckOut`, `deleteTree`.
*   **Versioning Services:** All versioning-related operations.
*   **Relationship Services:** All relationship-related operations.
*   **Policy Services:** All policy-related operations.
*   **ACL Services:** All ACL-related operations.
*   **Discovery Services:** `query`.
*   **Multi-filing:** CMIS supports multi-filing (an object can have multiple parents), which is not directly supported by Antbox's current `parent` field.

**Recommendation:** Implement additional CMIS operations as required. Some operations might require extensions or modifications to the core `NodeService` or domain models.

## Path Resolution

The current CMIS implementation primarily relies on Antbox UUIDs as CMIS `objectId`s. While `getChildren` and `getObject` can take an `objectId`, the `cmis:path` property in `toCmisObject` is a simplified representation.

**Limitation:** The `cmis:path` property is a simplified representation (`/` + node title) and does not reflect the full hierarchical path. Operations that rely on full path resolution (e.g., `getDescendants`, `getFolderTree`) are not implemented.

**Reason:** Antbox's `NodeService` primarily operates on UUIDs. Resolving full paths would require traversing the node hierarchy, similar to the WebDAV path resolution challenge.

**Recommendation:** Implement a robust path resolution mechanism, potentially by adding a `getByPath` method to `NodeService` or by building a path cache.

## Properties Mapping

The mapping of Antbox `NodeMetadata` to CMIS properties (`toCmisObject` function) is basic.

**Limitation:** Only a few core CMIS properties are mapped. Custom properties (from Antbox aspects) are not yet exposed as CMIS properties.

**Reason:** CMIS has a complex property model, including type definitions and data types. A full mapping requires a more sophisticated approach.

**Recommendation:**
1.  Implement a more comprehensive mapping of Antbox `NodeMetadata` fields to standard CMIS properties.
2.  Develop a mechanism to dynamically expose Antbox aspect properties as CMIS custom properties, including their data types. This might involve querying the `AspectService` to get aspect definitions.

## Authentication

The current implementation uses a hardcoded anonymous user for all requests.

**Limitation:** It does not support any form of authentication.

**Reason:** This is a preliminary implementation to get the basic CMIS functionality working.

**Recommendation:** Implement proper authentication. CMIS Browser Binding typically uses HTTP Basic Authentication or form-based authentication. The credentials should be validated against the users stored in Antbox using the `AuthService`. Once authenticated, the `AuthenticationContext` should be created with the correct principal.

## Error Handling

Error handling is basic, returning generic 500 or 404 status codes with a simple error message.

**Limitation:** CMIS specifies detailed error codes and structures for various error scenarios.

**Reason:** Simplified for initial implementation.

**Recommendation:** Implement CMIS-specific error handling, returning appropriate HTTP status codes and CMIS error objects.

## Content Stream Handling

The `getContentStream` operation directly returns the file content.

**Limitation:** Does not handle partial content requests (Range headers) or other advanced content stream features.

**Reason:** Simplified for initial implementation.

**Recommendation:** Enhance `getContentStream` to support HTTP Range requests and other content stream capabilities.

## Multi-tenancy

The current implementation assumes a single "default" tenant.

**Limitation:** Does not support multiple tenants as defined in Antbox.

**Reason:** Simplified for initial implementation.

**Recommendation:** Extend the CMIS server to handle multiple tenants, potentially by including the tenant ID in the URL path or as a request parameter, and then using the appropriate `NodeService` instance for that tenant.
