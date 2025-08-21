# Antbox API Postman Tests

This directory contains comprehensive Postman collections and environments for testing the Antbox API. The tests cover all major endpoints including authentication, skills management, node operations, and aspects functionality.

## 📁 Directory Structure

```
postman-tests/
├── README.md                                    # This file
├── run-tests.js                                # Automated test runner script
├── Antbox-Skills.postman_collection.json       # Skills API collection (auth + skills)
├── Antbox-Nodes.postman_collection.json        # Node management collection
├── Antbox-Aspects.postman_collection.json      # Aspects management collection
├── Antbox-Development.postman_environment.json # Development environment
├── Antbox-Production.postman_environment.json  # Production environment
└── reports/                                    # Test reports (generated)
```

## 🚀 Quick Start

### Prerequisites

1. **Postman** (for manual testing)
   - Download from [postman.com](https://www.postman.com/downloads/)

2. **Newman** (for automated testing)

   ```bash
   npm install -g newman
   npm install -g newman-reporter-html  # For HTML reports
   ```

3. **Running Antbox API Server**
   - Ensure the Antbox API server is running on the configured endpoint
   - Default development: `http://localhost:7180`

### Manual Testing with Postman

1. **Import Collections**
   - Open Postman
   - Click "Import" → Select all `.postman_collection.json` files
   - Import the environment files as well

2. **Set Environment**
   - Select "Antbox Development" or "Antbox Production" environment
   - Update environment variables as needed (see Configuration section)

3. **Authenticate**
   - Run the "Root Login" request in the Authentication folder
   - JWT token will be automatically stored for subsequent requests

4. **Run Tests**
   - Execute individual requests or entire folders
   - Use the Collection Runner for batch execution

### Automated Testing with Newman

1. **Run All Collections (Development)**

   ```bash
   node run-tests.js
   ```

2. **Run Specific Collection**

   ```bash
   node run-tests.js --collection nodes
   node run-tests.js --collection aspects
   node run-tests.js --collection skills
   ```

3. **Run with Different Environment**

   ```bash
   node run-tests.js --env production
   ```

4. **Generate HTML Report**

   ```bash
   node run-tests.js --reporter html --output ./reports
   ```

5. **Verbose Output with Bail on Failure**
   ```bash
   node run-tests.js --verbose --bail
   ```

## 🔐 Authentication Setup

All Antbox API endpoints (except login) require JWT authentication. The collections are designed to handle authentication automatically.

### How Authentication Works

1. **Root Login Process**
   - Each collection has an "Authentication" folder with a "Root Login" request
   - Login requires a SHA256 hash of the root password
   - Successful login returns a JWT token valid for 4 hours
   - JWT token is automatically stored in collection variables

2. **Automatic Token Management**
   - JWT tokens are stored in `{{jwt_token}}` collection variable
   - All protected endpoints use Bearer token authentication
   - Tokens are shared across requests within the same collection

3. **Authentication Flow**
   ```
   POST /login/root (with password hash) → JWT Token → Stored in {{jwt_token}} → Used in all subsequent requests
   ```

### Setting Up Authentication

#### 1. Generate Password Hash

```bash
# Replace 'your-password' with your actual root password
echo -n 'your-password' | sha256sum
```

#### 2. Configure Environment

Update your environment file with the generated hash:

```json
{
  "key": "root_password_hash",
  "value": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
  "type": "secret"
}
```

#### 3. Validate Setup

Use the authentication setup validator:

```bash
# Validate all collections and authentication setup
node setup-auth-tests.js

# Validate specific environment
node setup-auth-tests.js --env production

# Validation only (no live tests)
node setup-auth-tests.js --validate-only
```

### Authentication Test Runner

The enhanced test runner automatically handles authentication:

```bash
# Run with automatic authentication
node run-tests.js --collection aspects

# The runner will:
# 1. Run Authentication folder first
# 2. Extract and store JWT token
# 3. Run remaining tests with authentication
```

### Manual Authentication in Postman

1. **First Time Setup**
   - Import all collections and environments
   - Set your environment (Development/Production)
   - Update `root_password_hash` in environment variables

2. **Before Testing**
   - Open any collection
   - Go to "Authentication" folder
   - Run "Root Login" request
   - Verify JWT token is stored in collection variables

3. **Running Tests**
   - All requests will automatically use the stored JWT token
   - Token expires after 4 hours - re-authenticate as needed

### Authentication Security Notes

- **Password Hash**: Store only SHA256 hash, never plain text password
- **JWT Tokens**: Automatically expire after 4 hours
- **Environment Variables**: Use Postman's "secret" type for sensitive data
- **Production**: Never commit production credentials to version control

### Troubleshooting Authentication

#### Common Issues

1. **401 Unauthorized**

   ```bash
   # Check if JWT token is set
   pm.collectionVariables.get("jwt_token")

   # Re-run authentication
   node setup-auth-tests.js --env development
   ```

2. **Invalid Password Hash**

   ```bash
   # Regenerate hash
   echo -n 'your-actual-password' | sha256sum
   ```

3. **Token Expired**
   - JWT tokens expire after 4 hours
   - Re-run the "Root Login" request
   - Or restart your test session

4. **Missing Authentication Folder**
   - All collections should have an "Authentication" folder
   - If missing, re-import the latest collection files

#### Debug Authentication

```bash
# Verbose authentication testing
node setup-auth-tests.js --verbose

# Test specific collection authentication
newman run Antbox-Nodes.postman_collection.json \
  -e Antbox-Development.postman_environment.json \
  --folder "Authentication" \
  --verbose
```

## 📋 Collections Overview

### 1. Antbox Skills API Collection

**File:** `Antbox-Skills.postman_collection.json`

**Endpoints Covered:**

- **Authentication**
  - Root user login with password hash
  - JWT token management
- **Skills Management**
  - List all skills
  - Create new skills
  - Get skill by UUID
  - Update existing skills
  - Delete skills
  - Export skills (various formats)
  - List action-exposed skills
  - Execute skill actions
- **Error Handling**
  - Unauthorized access tests
  - Invalid UUID format tests
  - Resource not found tests

**Key Features:**

- Automatic JWT token extraction and storage
- Comprehensive error scenario testing
- Global response time validation
- Header validation tests

### 2. Nodes API Collection

**File:** `Antbox-Nodes.postman_collection.json`

**Endpoints Covered:**

- **Node Management**
  - List nodes with pagination
  - Create new nodes
  - Get node by UUID
  - Update existing nodes
  - Delete nodes
- **Node Operations**
  - Copy nodes to different locations
  - Duplicate nodes
  - Export node content
  - Evaluate node content (execution)
- **Search & Find**
  - Full-text search with filters
  - Tag-based filtering
  - MIME type filtering
  - Advanced query operations

**Key Features:**

- CRUD operation validation
- Search functionality testing
- File operation testing
- Dynamic UUID management

### 3. Aspects API Collection

**File:** `Antbox-Aspects.postman_collection.json`

**Endpoints Covered:**

- **Aspect Management**
  - List all aspects with pagination
  - Create new aspects
  - Get aspect by UUID
  - Update existing aspects
  - Delete aspects
- **Aspect Operations**
  - Export aspects as JavaScript files
  - Custom filename generation
- **Search & Filtering**
  - Filter by MIME type
  - Filter by tags
  - Sort by modification time
  - Advanced filtering options

**Key Features:**

- JavaScript export validation
- Content type verification
- Filtering and sorting tests
- Timestamp-based operations

## 🔧 Configuration

### Environment Variables

Both development and production environments include these variables:

| Variable             | Description                  | Development Default     | Production Default       |
| -------------------- | ---------------------------- | ----------------------- | ------------------------ |
| `base_url`           | API base URL                 | `http://localhost:7180` | `https://api.antbox.com` |
| `root_password_hash` | SHA256 hash of root password | Test hash               | Empty (set manually)     |
| `jwt_token`          | Authentication token         | Auto-populated          | Auto-populated           |
| `skill_uuid`         | Sample skill UUID            | Test UUID               | Empty                    |
| `test_node_uuid`     | Sample node UUID             | Test UUID               | Empty                    |
| `test_aspect_uuid`   | Sample aspect UUID           | Test UUID               | Empty                    |
| `api_timeout`        | Request timeout (ms)         | 5000                    | 10000                    |

### Customizing Environments

1. **Development Environment**
   - Update `base_url` if using different port
   - Set `root_password_hash` to your local root password hash
   - UUIDs can remain as test values

2. **Production Environment**
   - Set correct `base_url` for your production server
   - **Important:** Set `root_password_hash` securely
   - Update test UUIDs with real resource IDs
   - Consider increasing `api_timeout` for slower networks

### Security Notes

- **Never commit production passwords or sensitive UUIDs to version control**
- Use Postman's secret variable type for sensitive data
- The `root_password_hash` should be SHA256 hash of your actual password
- Consider using separate service accounts for testing in production
- JWT tokens expire after 4 hours for security
- All creation and modification operations require authentication

## 🧪 Test Structure

### Global Test Scripts

Each collection includes global pre-request and test scripts:

**Pre-request Scripts:**

- Set default pagination values
- Generate timestamps for unique test data
- Validate required environment variables

**Global Tests:**

- Response time validation (under configured timeout)
- Header presence validation
- Basic response structure validation

### Individual Test Cases

Each request includes specific tests for:

- **Status Code Validation:** Correct HTTP status codes
- **Response Structure:** Required fields and data types
- **Data Integrity:** UUID format validation, relationship consistency
- **Business Logic:** Proper data filtering, sorting, and pagination
- **Error Handling:** Appropriate error messages and codes

### Dynamic Variables

Tests use dynamic variables for:

- **UUID Storage:** Automatically store created resource UUIDs
- **Token Management:** JWT tokens for authentication
- **Timestamp Generation:** Unique identifiers for test data
- **Pagination:** Dynamic offset and limit values

## 📊 Test Reports

### Newman CLI Reports

Default console output includes:

- Request execution status
- Test results summary
- Failure details
- Response times

### HTML Reports

Generate detailed HTML reports:

```bash
node run-tests.js --reporter html
```

HTML reports include:

- Visual test result dashboard
- Request/response details
- Performance metrics
- Error analysis
- Interactive charts

### JSON Reports

Generate machine-readable JSON reports:

```bash
node run-tests.js --reporter json
```

JSON reports contain:

- Structured test results
- Detailed execution data
- Performance metrics
- Error information

## 🔍 Troubleshooting

### Common Issues

1. **Newman Not Found**

   ```bash
   npm install -g newman
   ```

2. **Connection Refused**
   - Verify Antbox API server is running
   - Check `base_url` in environment
   - Verify network connectivity

3. **Authentication Failures**
   - Verify `root_password_hash` is correct SHA256 hash
   - Check if JWT token has expired
   - Ensure authentication endpoint is working

4. **Test UUID Not Found**
   - Update test UUIDs in environment with valid resource IDs
   - Run create operations first to generate test data
   - Check resource permissions

### Debug Mode

Enable verbose output for debugging:

```bash
node run-tests.js --verbose
```

This provides:

- Detailed request/response information
- Test execution flow
- Variable values
- Error stack traces

### Environment-Specific Issues

**Development:**

- Ensure local server is running on correct port
- Check for CORS issues in browser-based testing
- Verify database is properly seeded

**Production:**

- Verify SSL certificates for HTTPS endpoints
- Check network access and firewall rules
- Ensure production database has test-safe data

## 🤝 Contributing

### Adding New Tests

1. **New Endpoints:**
   - Add requests to appropriate collection
   - Include comprehensive test scripts
   - Update environment variables if needed
   - Document in this README

2. **New Collections:**
   - Create new `.postman_collection.json` file
   - Add to `run-tests.js` configuration
   - Include in documentation

3. **Test Best Practices:**
   - Use descriptive test names
   - Validate both success and error scenarios
   - Include data cleanup where necessary
   - Use dynamic variables for reusability

### Collection Maintenance

- Keep collections in sync with API changes
- Update test assertions when API behavior changes
- Maintain backward compatibility where possible
- Version control collection exports

## 📞 Support

For issues related to:

- **Antbox API:** Check the main project documentation
- **Postman Collections:** Create an issue in the project repository
- **Newman Issues:** Refer to [Newman documentation](https://github.com/postmanlabs/newman)

## 📚 Additional Resources

- [Postman Documentation](https://learning.postman.com/)
- [Newman Command Line Collection Runner](https://github.com/postmanlabs/newman)
- [Antbox API OpenAPI Specification](../openapi.yaml)
- [Postman Test Script Examples](https://learning.postman.com/docs/writing-scripts/test-scripts/)
