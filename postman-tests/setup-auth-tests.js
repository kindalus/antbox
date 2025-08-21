#!/usr/bin/env node

/**
 * Antbox API Test Setup with Authentication
 *
 * This script sets up and validates the authentication flow for all Postman collections.
 * It ensures that all creation features require authentication first and that JWT tokens
 * are properly shared across requests.
 *
 * Features:
 * - Validates authentication setup in all collections
 * - Tests JWT token generation and usage
 * - Ensures proper environment configuration
 * - Runs authentication smoke tests
 * - Provides detailed setup validation
 *
 * Usage:
 *   node setup-auth-tests.js [options]
 *
 * Options:
 *   --env, -e <environment>    Environment to validate (development|production) [default: development]
 *   --validate-only, -v        Only validate configuration, don't run tests
 *   --fix-collections, -f      Attempt to auto-fix collection issues
 *   --verbose                  Verbose output
 *   --help, -h                 Show help
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const crypto = require("crypto");

// Configuration
const CONFIG = {
  collections: {
    skills: "Antbox-Skills.postman_collection.json",
    nodes: "Antbox-Nodes.postman_collection.json",
    aspects: "Antbox-Aspects.postman_collection.json",
  },
  environments: {
    development: "Antbox-Development.postman_environment.json",
    production: "Antbox-Production.postman_environment.json",
  },
  requiredVariables: ["base_url", "jwt_token", "root_password_hash"],
  authenticationFolderName: "Authentication",
  loginRequestName: "Root Login",
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    environment: "development",
    validateOnly: false,
    fixCollections: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--env":
      case "-e":
        options.environment = nextArg;
        i++;
        break;
      case "--validate-only":
      case "-v":
        options.validateOnly = true;
        break;
      case "--fix-collections":
      case "-f":
        options.fixCollections = true;
        break;
      case "--verbose":
        options.verbose = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return options;
}

// Show help message
function showHelp() {
  console.log(`
Antbox API Test Setup with Authentication

This script validates and sets up authentication for Postman collections,
ensuring all creation features require JWT authentication.

Usage: node setup-auth-tests.js [options]

Options:
  --env, -e <environment>    Environment to validate (development|production) [default: development]
  --validate-only, -v        Only validate configuration, don't run tests
  --fix-collections, -f      Attempt to auto-fix collection issues
  --verbose                  Verbose output
  --help, -h                 Show help

Examples:
  node setup-auth-tests.js                           # Full setup validation for development
  node setup-auth-tests.js --env production          # Validate production environment
  node setup-auth-tests.js --validate-only           # Only validate, don't run tests
  node setup-auth-tests.js --fix-collections         # Auto-fix collection issues

What this script validates:
  ✓ Environment configuration
  ✓ Collection structure and authentication setup
  ✓ JWT token variables and usage
  ✓ Authentication request configuration
  ✓ Bearer token setup in protected endpoints
  ✓ Root password hash configuration
`);
}

// Validate environment file
function validateEnvironment(envFile, options) {
  console.log(`\n🔍 Validating environment: ${envFile}`);

  if (!fs.existsSync(envFile)) {
    console.error(`❌ Environment file not found: ${envFile}`);
    return false;
  }

  try {
    const env = JSON.parse(fs.readFileSync(envFile, "utf8"));

    if (!env.values || !Array.isArray(env.values)) {
      console.error(`❌ Invalid environment structure in ${envFile}`);
      return false;
    }

    const variables = env.values.reduce((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {});

    let isValid = true;

    // Check required variables
    for (const reqVar of CONFIG.requiredVariables) {
      if (!variables.hasOwnProperty(reqVar)) {
        console.error(`❌ Missing required variable: ${reqVar}`);
        isValid = false;
      } else if (options.verbose) {
        console.log(`✅ Found variable: ${reqVar}`);
      }
    }

    // Validate base_url format
    if (variables.base_url) {
      try {
        new URL(variables.base_url);
        if (options.verbose) {
          console.log(`✅ Valid base_url: ${variables.base_url}`);
        }
      } catch (error) {
        console.error(`❌ Invalid base_url format: ${variables.base_url}`);
        isValid = false;
      }
    }

    // Validate root_password_hash format (should be SHA256 hex)
    if (variables.root_password_hash) {
      if (!/^[a-f0-9]{64}$/i.test(variables.root_password_hash)) {
        console.error(
          `❌ Invalid root_password_hash format (should be 64-char hex string)`,
        );
        isValid = false;
      } else if (options.verbose) {
        console.log(`✅ Valid root_password_hash format`);
      }
    }

    if (isValid) {
      console.log(`✅ Environment validation passed`);
    }

    return isValid;
  } catch (error) {
    console.error(`❌ Error parsing environment file: ${error.message}`);
    return false;
  }
}

// Validate collection authentication setup
function validateCollection(collectionFile, options) {
  console.log(`\n🔍 Validating collection: ${path.basename(collectionFile)}`);

  if (!fs.existsSync(collectionFile)) {
    console.error(`❌ Collection file not found: ${collectionFile}`);
    return false;
  }

  try {
    const collection = JSON.parse(fs.readFileSync(collectionFile, "utf8"));
    let isValid = true;
    let hasAuth = false;
    let authRequests = 0;

    // Check if collection has authentication folder
    if (collection.item && Array.isArray(collection.item)) {
      for (const folder of collection.item) {
        if (folder.name && folder.name.toLowerCase() === "authentication") {
          hasAuth = true;
          if (options.verbose) {
            console.log(`✅ Found Authentication folder`);
          }

          // Check for login request in auth folder
          if (folder.item && Array.isArray(folder.item)) {
            for (const request of folder.item) {
              if (request.name && request.name.includes("Login")) {
                authRequests++;

                // Validate login request structure
                if (request.request && request.request.url) {
                  const url =
                    typeof request.request.url === "string"
                      ? request.request.url
                      : request.request.url.raw;

                  if (url.includes("/login/root")) {
                    if (options.verbose) {
                      console.log(
                        `✅ Found valid login endpoint: ${request.name}`,
                      );
                    }
                  } else {
                    console.error(
                      `❌ Invalid login endpoint in ${request.name}`,
                    );
                    isValid = false;
                  }

                  // Check for JWT token storage in test scripts
                  if (request.event && Array.isArray(request.event)) {
                    const testEvent = request.event.find(
                      (e) => e.listen === "test",
                    );
                    if (
                      testEvent &&
                      testEvent.script &&
                      testEvent.script.exec
                    ) {
                      const testScript = testEvent.script.exec.join("\n");
                      if (
                        testScript.includes(
                          'pm.collectionVariables.set("jwt_token"',
                        )
                      ) {
                        if (options.verbose) {
                          console.log(
                            `✅ JWT token storage configured in ${request.name}`,
                          );
                        }
                      } else {
                        console.error(
                          `❌ Missing JWT token storage in ${request.name}`,
                        );
                        isValid = false;
                      }
                    }
                  }
                }
              }
            }
          }
          break;
        }
      }
    }

    if (!hasAuth) {
      console.error(`❌ Missing Authentication folder`);
      isValid = false;
    }

    if (authRequests === 0) {
      console.error(`❌ No login requests found in Authentication folder`);
      isValid = false;
    }

    // Check for JWT token usage in protected endpoints
    let protectedEndpoints = 0;
    let validAuthEndpoints = 0;

    function checkFolderAuth(items, folderName = "") {
      if (!Array.isArray(items)) return;

      for (const item of items) {
        if (item.item && Array.isArray(item.item)) {
          // This is a folder, recurse
          checkFolderAuth(item.item, item.name || folderName);
        } else if (
          item.request &&
          folderName.toLowerCase() !== "authentication"
        ) {
          // This is a request outside authentication folder
          protectedEndpoints++;

          // Check if it has bearer token auth
          if (
            item.request.auth &&
            item.request.auth.type === "bearer" &&
            item.request.auth.bearer
          ) {
            const tokenConfig = item.request.auth.bearer.find(
              (b) => b.key === "token",
            );
            if (tokenConfig && tokenConfig.value === "{{jwt_token}}") {
              validAuthEndpoints++;
              if (options.verbose) {
                console.log(`✅ Proper JWT auth in: ${item.name}`);
              }
            } else {
              console.error(
                `❌ Invalid JWT token configuration in: ${item.name}`,
              );
              isValid = false;
            }
          } else {
            // Check if this is an error test case (should not have auth)
            if (
              !item.name ||
              !item.name.toLowerCase().includes("unauthorized")
            ) {
              console.error(`❌ Missing authentication in: ${item.name}`);
              isValid = false;
            }
          }
        }
      }
    }

    checkFolderAuth(collection.item);

    if (options.verbose) {
      console.log(`📊 Protected endpoints: ${protectedEndpoints}`);
      console.log(`📊 Properly authenticated: ${validAuthEndpoints}`);
    }

    // Check collection variables
    if (collection.variable && Array.isArray(collection.variable)) {
      const collectionVars = collection.variable.reduce((acc, item) => {
        acc[item.key] = item.value;
        return acc;
      }, {});

      // Check for jwt_token variable
      if (collectionVars.hasOwnProperty("jwt_token")) {
        if (options.verbose) {
          console.log(`✅ JWT token collection variable found`);
        }
      } else {
        console.error(`❌ Missing jwt_token collection variable`);
        isValid = false;
      }

      // Check for root_password_hash variable
      if (collectionVars.hasOwnProperty("root_password_hash")) {
        if (options.verbose) {
          console.log(`✅ Root password hash collection variable found`);
        }
      } else {
        console.error(`❌ Missing root_password_hash collection variable`);
        isValid = false;
      }
    }

    if (isValid) {
      console.log(`✅ Collection validation passed`);
    }

    return isValid;
  } catch (error) {
    console.error(`❌ Error parsing collection file: ${error.message}`);
    return false;
  }
}

// Test authentication flow
async function testAuthenticationFlow(envFile, options) {
  console.log(`\n🧪 Testing authentication flow...`);

  try {
    const env = JSON.parse(fs.readFileSync(envFile, "utf8"));
    const variables = env.values.reduce((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {});

    const baseUrl = variables.base_url;
    const passwordHash = variables.root_password_hash;

    if (!baseUrl || !passwordHash) {
      console.error(`❌ Missing base_url or root_password_hash in environment`);
      return false;
    }

    // Test the authentication endpoint
    console.log(`🔐 Testing login endpoint: ${baseUrl}/login/root`);

    const testCommand = `curl -s -X POST "${baseUrl}/login/root" \\
      -H "Content-Type: text/plain" \\
      -d "${passwordHash}" \\
      --max-time 10`;

    try {
      const result = execSync(testCommand, { encoding: "utf8" });
      const response = JSON.parse(result);

      if (response.jwt && typeof response.jwt === "string") {
        console.log(`✅ Authentication test successful`);
        console.log(`📝 JWT token received (${response.jwt.length} chars)`);

        // Validate JWT format (basic check)
        const jwtParts = response.jwt.split(".");
        if (jwtParts.length === 3) {
          console.log(`✅ JWT format is valid`);
          if (options.verbose) {
            console.log(
              `📋 JWT header: ${Buffer.from(jwtParts[0], "base64").toString()}`,
            );
          }
        } else {
          console.error(`❌ Invalid JWT format`);
          return false;
        }

        return true;
      } else {
        console.error(`❌ Authentication failed - no JWT token in response`);
        return false;
      }
    } catch (curlError) {
      console.error(`❌ Authentication test failed: ${curlError.message}`);
      console.log(`💡 Make sure the Antbox server is running at ${baseUrl}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error testing authentication: ${error.message}`);
    return false;
  }
}

// Run smoke tests with authentication
function runSmokeTests(options) {
  console.log(`\n🧪 Running authentication smoke tests...`);

  const envFile = CONFIG.environments[options.environment];
  const testResults = [];

  // Test each collection's authentication folder
  for (const [collectionName, collectionFile] of Object.entries(
    CONFIG.collections,
  )) {
    if (!fs.existsSync(collectionFile)) {
      console.warn(`⚠️  Collection not found: ${collectionFile}`);
      continue;
    }

    console.log(`\n🔬 Testing ${collectionName} authentication...`);

    try {
      const command = `newman run "${collectionFile}" -e "${envFile}" \\
        --folder "Authentication" \\
        --timeout-request 10000 \\
        --bail \\
        --silent`;

      execSync(command, { stdio: "pipe" });
      console.log(`✅ ${collectionName} authentication smoke test passed`);
      testResults.push({ collection: collectionName, success: true });
    } catch (error) {
      console.error(`❌ ${collectionName} authentication smoke test failed`);
      testResults.push({ collection: collectionName, success: false });
    }
  }

  const passed = testResults.filter((r) => r.success).length;
  const total = testResults.length;

  console.log(`\n📊 Smoke test results: ${passed}/${total} collections passed`);
  return passed === total;
}

// Generate authentication setup report
function generateReport(validationResults) {
  console.log(`\n📋 Authentication Setup Report`);
  console.log("=====================================");

  const totalChecks = Object.values(validationResults).length;
  const passedChecks = Object.values(validationResults).filter((r) => r).length;

  console.log(
    `Overall Status: ${passedChecks === totalChecks ? "✅ PASS" : "❌ FAIL"}`,
  );
  console.log(`Checks Passed: ${passedChecks}/${totalChecks}`);
  console.log("");

  for (const [check, result] of Object.entries(validationResults)) {
    const status = result ? "✅" : "❌";
    console.log(`${status} ${check}`);
  }

  if (passedChecks < totalChecks) {
    console.log("\n💡 Recommendations:");
    console.log("   1. Ensure all collections have Authentication folders");
    console.log("   2. Verify JWT token variables are properly configured");
    console.log(
      "   3. Check that all protected endpoints use Bearer authentication",
    );
    console.log("   4. Validate environment file has correct variables");
    console.log("   5. Make sure the Antbox server is running and accessible");
  }

  return passedChecks === totalChecks;
}

// Main function
function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    return;
  }

  console.log("🛡️  Antbox API Authentication Setup Validator");
  console.log("==============================================");
  console.log(`Environment: ${options.environment}`);
  console.log(
    `Mode: ${options.validateOnly ? "Validation Only" : "Full Test Suite"}`,
  );

  const envFile = CONFIG.environments[options.environment];
  const validationResults = {};

  // Step 1: Validate environment
  validationResults["Environment Configuration"] = validateEnvironment(
    envFile,
    options,
  );

  // Step 2: Validate collections
  for (const [name, file] of Object.entries(CONFIG.collections)) {
    validationResults[`${name} Collection`] = validateCollection(file, options);
  }

  // Step 3: Test authentication flow (if not validation-only)
  if (!options.validateOnly) {
    validationResults["Authentication Flow"] = false;

    // Use a Promise wrapper to handle async function
    (async () => {
      try {
        validationResults["Authentication Flow"] = await testAuthenticationFlow(
          envFile,
          options,
        );

        // Step 4: Run smoke tests
        if (validationResults["Authentication Flow"]) {
          validationResults["Smoke Tests"] = runSmokeTests(options);
        }

        // Generate final report
        const success = generateReport(validationResults);

        if (success) {
          console.log("\n🎉 All authentication setup checks passed!");
          console.log(
            "✅ Your Postman collections are ready for authenticated testing.",
          );
          process.exit(0);
        } else {
          console.log("\n❌ Some authentication setup checks failed!");
          console.log(
            "🔧 Please review the issues above and fix them before running tests.",
          );
          process.exit(1);
        }
      } catch (error) {
        console.error(`\n💥 Unexpected error: ${error.message}`);
        process.exit(1);
      }
    })();
  } else {
    // Generate report for validation-only mode
    const success = generateReport(validationResults);
    process.exit(success ? 0 : 1);
  }
}

// Export for testing
module.exports = {
  validateEnvironment,
  validateCollection,
  testAuthenticationFlow,
  parseArgs,
  CONFIG,
};

// Run if called directly
if (require.main === module) {
  main();
}
