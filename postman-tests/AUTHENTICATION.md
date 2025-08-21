# Antbox API Authentication Setup Guide

This guide provides comprehensive instructions for setting up authentication in Postman collections for the Antbox API. All creation features require JWT authentication.

## 🎯 Quick Setup (5 minutes)

1. **Generate your password hash:**

   ```bash
   ./verify-auth.sh --generate-hash
   ```

2. **Update environment variables:**
   - Open `Antbox-Development.postman_environment.json`
   - Set `root_password_hash` to your generated hash

3. **Verify setup:**

   ```bash
   ./verify-auth.sh
   ```

4. **Run tests:**
   ```bash
   node run-tests.js
   ```

## 🔐 Authentication Flow

### How It Works

```mermaid
graph LR
    A[Client] --> B[POST /login/root]
    B --> C[SHA256 Password Hash]
    C --> D[JWT Token]
    D --> E[Bearer Authentication]
    E --> F[Protected Endpoints]
```

1. **Login Request**: Send SHA256 hash of root password to `/login/root`
2. **JWT Response**: Server returns JWT token valid for 4 hours
3. **Token Storage**: Postman automatically stores token in `{{jwt_token}}`
4. **Bearer Auth**: All subsequent requests use `Authorization: Bearer {{jwt_token}}`

### Authentication Requirements

- **All creation operations** (POST requests) require authentication
- **All modification operations** (PUT/PATCH requests) require authentication
- **All deletion operations** (DELETE requests) require authentication
- **Some read operations** may require authentication based on permissions

## 🛠️ Detailed Setup

### Step 1: Generate Password Hash

The API requires a SHA256 hash of your root password, not the plain text password.

#### Option A: Using the verification script

```bash
./verify-auth.sh --generate-hash
```

#### Option B: Using command line tools

```bash
# Linux/macOS with sha256sum
echo -n 'your-password' | sha256sum

# macOS with shasum
echo -n 'your-password' | shasum -a 256

# Using OpenSSL (cross-platform)
echo -n 'your-password' | openssl dgst -sha256
```

#### Option C: Using Node.js

```javascript
const crypto = require("crypto");
const password = "your-password";
const hash = crypto.createHash("sha256").update(password).digest("hex");
console.log(hash);
```

### Step 2: Configure Environment

Update your environment file with the generated hash:

#### Development Environment (`Antbox-Development.postman_environment.json`)

```json
{
  "key": "root_password_hash",
  "value": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
  "type": "secret",
  "enabled": true
}
```

#### Production Environment (`Antbox-Production.postman_environment.json`)

```json
{
  "key": "root_password_hash",
  "value": "your-production-password-hash-here",
  "type": "secret",
  "enabled": true
}
```

### Step 3: Verify Collection Structure

Each collection should have:

1. **Authentication Folder**: Contains login requests
2. **Root Login Request**: POST to `/login/root`
3. **JWT Token Storage**: Test script that stores token
4. **Bearer Auth**: All protected endpoints use `{{jwt_token}}`

### Step 4: Test Authentication

#### Quick verification:

```bash
./verify-auth.sh
```

#### Detailed validation:

```bash
node setup-auth-tests.js
```

#### Manual test with curl:

```bash
curl -X POST "http://localhost:7180/login/root" \
  -H "Content-Type: text/plain" \
  -d "your-sha256-hash-here"
```

Expected response:

```json
{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## 🔧 Collection Configuration

### Authentication Folder Structure

Each collection contains an "Authentication" folder with:

```
📁 Authentication/
└── 📄 Root Login
    ├── Method: POST
    ├── URL: {{base_url}}/login/root
    ├── Body: {{root_password_hash}}
    └── Tests: Store JWT token
```

### Root Login Request Configuration

**Method**: `POST`
**URL**: `{{base_url}}/login/root`
**Headers**:

```
Content-Type: text/plain
```

**Body** (raw):

```
{{root_password_hash}}
```

**Test Script**:

```javascript
pm.test("Status code is 200", function () {
  pm.response.to.have.status(200);
});

pm.test("Response has JWT token", function () {
  var jsonData = pm.response.json();
  pm.expect(jsonData).to.have.property("jwt");
  pm.expect(jsonData.jwt).to.be.a("string");
  pm.expect(jsonData.jwt.length).to.be.greaterThan(0);
});

pm.test("Store JWT token for subsequent requests", function () {
  var jsonData = pm.response.json();
  if (jsonData.jwt) {
    pm.collectionVariables.set("jwt_token", jsonData.jwt);
  }
});
```

### Protected Endpoint Configuration

All protected endpoints should have:

**Authentication Type**: `Bearer Token`
**Token**: `{{jwt_token}}`

Example configuration:

```json
{
  "auth": {
    "type": "bearer",
    "bearer": [
      {
        "key": "token",
        "value": "{{jwt_token}}",
        "type": "string"
      }
    ]
  }
}
```

## 🚀 Running Tests

### Automated Testing

The enhanced test runner handles authentication automatically:

```bash
# Run all collections with authentication
node run-tests.js

# Run specific collection
node run-tests.js --collection nodes

# Run with verbose output
node run-tests.js --verbose

# Generate HTML report
node run-tests.js --reporter html
```

### Manual Testing in Postman

1. **Import collections and environments**
2. **Select appropriate environment** (Development/Production)
3. **Run Authentication folder first**:
   - Open any collection
   - Navigate to "Authentication" folder
   - Run "Root Login" request
   - Verify JWT token is stored
4. **Run other requests** - they will automatically use the stored token

### Test Execution Order

The test runner ensures proper execution order:

1. **Authentication folder** runs first
2. **JWT token** is extracted and stored
3. **Remaining folders** run with authentication
4. **Token sharing** across all requests in the collection

## 🔍 Troubleshooting

### Common Authentication Issues

#### 1. 401 Unauthorized Error

**Symptoms**: All requests return 401 status
**Causes**:

- JWT token not set or expired
- Invalid password hash
- Authentication request not run

**Solutions**:

```bash
# Verify authentication setup
node setup-auth-tests.js

# Check JWT token in collection variables
# In Postman: Collection → Variables → jwt_token

# Re-run authentication
newman run collection.json -e environment.json --folder "Authentication"
```

#### 2. Invalid Password Hash

**Symptoms**: Login request returns 401
**Causes**:

- Wrong password
- Incorrect hash format
- Hash not URL-encoded properly

**Solutions**:

```bash
# Regenerate hash
./verify-auth.sh --generate-hash

# Verify hash format (should be 64 hex characters)
echo "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3" | wc -c
# Should output: 65 (64 chars + newline)
```

#### 3. Token Expiration

**Symptoms**: Tests pass initially, then start failing with 401
**Causes**:

- JWT tokens expire after 4 hours
- Long-running test sessions

**Solutions**:

```bash
# Re-authenticate
node run-tests.js --collection skills

# Check token expiration in JWT payload
# Decode JWT at https://jwt.io/
```

#### 4. Missing Authentication Folder

**Symptoms**: No JWT token stored, immediate 401 errors
**Causes**:

- Collection missing Authentication folder
- Incorrect folder name

**Solutions**:

```bash
# Validate collection structure
node setup-auth-tests.js --validate-only

# Re-import latest collection files
```

### Debug Commands

```bash
# Comprehensive validation
node setup-auth-tests.js --verbose

# Quick connectivity test
./verify-auth.sh

# Test specific collection authentication
newman run Antbox-Nodes.postman_collection.json \
  -e Antbox-Development.postman_environment.json \
  --folder "Authentication" \
  --verbose

# Test with curl
curl -v -X POST "http://localhost:7180/login/root" \
  -H "Content-Type: text/plain" \
  -d "$(grep -o '"root_password_hash"[^}]*"value":"[^"]*"' Antbox-Development.postman_environment.json | sed 's/.*"value":"\([^"]*\)".*/\1/')"
```

## 🛡️ Security Best Practices

### Password Management

- **Never store plain text passwords** in any file
- **Use SHA256 hashes** for authentication
- **Use Postman's secret variables** for sensitive data
- **Don't commit production credentials** to version control

### Environment Security

```json
{
  "key": "root_password_hash",
  "value": "your-hash-here",
  "type": "secret", // ← Important: use secret type
  "enabled": true
}
```

### JWT Token Handling

- **Tokens expire after 4 hours** - re-authenticate as needed
- **Tokens are stored in memory** - not persisted between Postman sessions
- **Collection variables** are used for token sharing within collections
- **Environment variables** can be used for token sharing across collections

### Production Considerations

- **Use separate credentials** for testing vs production
- **Implement token rotation** for long-running test suites
- **Monitor authentication failures** in production testing
- **Use service accounts** instead of personal accounts when possible

## 📚 API Reference

### Authentication Endpoint

**Endpoint**: `POST /login/root`
**Content-Type**: `text/plain`
**Body**: SHA256 hash of root password
**Response**:

```json
{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InJvb3RAYW50Ym94LmNvbSIsImlhdCI6MTcwMDAwMDAwMCwiaXNzIjoidXJuOmFudGJveCIsImV4cCI6MTcwMDAxNDQwMH0.signature"
}
```

### JWT Token Structure

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "email": "root@antbox.com",
    "iat": 1700000000,
    "iss": "urn:antbox",
    "exp": 1700014400
  }
}
```

### Protected Endpoints

All endpoints except `/login/root` require the `Authorization` header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 📝 Collection Variables Reference

### Required Variables

| Variable             | Type   | Description                  | Example                 |
| -------------------- | ------ | ---------------------------- | ----------------------- |
| `base_url`           | string | API base URL                 | `http://localhost:7180` |
| `jwt_token`          | string | JWT authentication token     | Auto-populated          |
| `root_password_hash` | secret | SHA256 hash of root password | `a665a45920...`         |

### Optional Variables

| Variable           | Type   | Description               | Default   |
| ------------------ | ------ | ------------------------- | --------- |
| `api_timeout`      | string | Request timeout in ms     | `5000`    |
| `test_node_uuid`   | string | Sample node for testing   | Generated |
| `test_aspect_uuid` | string | Sample aspect for testing | Generated |
| `test_skill_uuid`  | string | Sample skill for testing  | Generated |

## 🆘 Support

### Getting Help

1. **Validation Issues**: Run `node setup-auth-tests.js --verbose`
2. **Connection Problems**: Run `./verify-auth.sh`
3. **Test Failures**: Check the troubleshooting section above
4. **API Changes**: Refer to the OpenAPI specification

### Additional Resources

- [Postman Authentication Documentation](https://learning.postman.com/docs/sending-requests/authorization/)
- [JWT.io Token Debugger](https://jwt.io/)
- [Newman CLI Documentation](https://github.com/postmanlabs/newman)
- [Antbox API OpenAPI Spec](../openapi.yaml)

---

**Remember**: Authentication is required for all creation, modification, and deletion operations. Always run the Authentication folder first when testing manually, or use the automated test runner for seamless authentication handling.
