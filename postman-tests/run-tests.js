#!/usr/bin/env node

/**
 * Newman Test Runner for Antbox API
 *
 * This script runs Postman collections using Newman CLI for automated testing.
 * It supports multiple environments and provides detailed reporting.
 *
 * Usage:
 *   node run-tests.js [options]
 *
 * Options:
 *   --env, -e <environment>    Environment to use (development|production) [default: development]
 *   --collection, -c <name>    Specific collection to run (all collections by default)
 *   --reporter, -r <type>      Reporter type (cli|html|json) [default: cli]
 *   --output, -o <directory>   Output directory for reports [default: ./reports]
 *   --bail                     Stop on first failure
 *   --verbose, -v              Verbose output
 *   --help, -h                 Show help
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

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
  defaultReportsDir: "./reports",
  defaultEnvironment: "development",
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    environment: CONFIG.defaultEnvironment,
    collection: null,
    reporter: "cli",
    output: CONFIG.defaultReportsDir,
    bail: false,
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
      case "--collection":
      case "-c":
        options.collection = nextArg;
        i++;
        break;
      case "--reporter":
      case "-r":
        options.reporter = nextArg;
        i++;
        break;
      case "--output":
      case "-o":
        options.output = nextArg;
        i++;
        break;
      case "--bail":
        options.bail = true;
        break;
      case "--verbose":
      case "-v":
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
Newman Test Runner for Antbox API

Usage: node run-tests.js [options]

Options:
  --env, -e <environment>    Environment to use (development|production) [default: development]
  --collection, -c <name>    Specific collection to run (skills|nodes|aspects) [default: all]
  --reporter, -r <type>      Reporter type (cli|html|json) [default: cli]
  --output, -o <directory>   Output directory for reports [default: ./reports]
  --bail                     Stop on first failure
  --verbose, -v              Verbose output
  --help, -h                 Show help

Examples:
  node run-tests.js                                    # Run all collections with development environment
  node run-tests.js --env production                   # Run all collections with production environment
  node run-tests.js --collection nodes --reporter html # Run nodes collection with HTML report
  node run-tests.js --bail --verbose                   # Run with verbose output and stop on first failure

Available Collections:
  skills   - Skills management and functional operations
  nodes    - Node management and content operations
  aspects  - Aspect management and operations

Available Environments:
  development - Local development server (localhost:7180)
  production  - Production server configuration
`);
}

// Check if Newman is installed
function checkNewmanInstallation() {
  try {
    execSync("newman --version", { stdio: "ignore" });
  } catch (error) {
    console.error("❌ Newman is not installed. Please install it first:");
    console.error("   npm install -g newman");
    console.error("   npm install -g newman-reporter-html  # For HTML reports");
    process.exit(1);
  }
}

// Validate options
function validateOptions(options) {
  // Check environment
  if (!CONFIG.environments[options.environment]) {
    console.error(`❌ Invalid environment: ${options.environment}`);
    console.error(
      `Available environments: ${Object.keys(CONFIG.environments).join(", ")}`,
    );
    process.exit(1);
  }

  // Check collection
  if (options.collection && !CONFIG.collections[options.collection]) {
    console.error(`❌ Invalid collection: ${options.collection}`);
    console.error(
      `Available collections: ${Object.keys(CONFIG.collections).join(", ")}`,
    );
    process.exit(1);
  }

  // Check if files exist
  const envFile = CONFIG.environments[options.environment];
  if (!fs.existsSync(envFile)) {
    console.error(`❌ Environment file not found: ${envFile}`);
    process.exit(1);
  }

  const collectionsToRun = options.collection
    ? [CONFIG.collections[options.collection]]
    : Object.values(CONFIG.collections);

  for (const collection of collectionsToRun) {
    if (!fs.existsSync(collection)) {
      console.error(`❌ Collection file not found: ${collection}`);
      process.exit(1);
    }
  }
}

// Create reports directory
function ensureReportsDirectory(outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
}

// Generate timestamp for reports
function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
}

// Run a single collection with automatic authentication
function runCollection(collectionFile, environmentFile, options) {
  const collectionName = path.basename(
    collectionFile,
    ".postman_collection.json",
  );
  const timestamp = getTimestamp();

  console.log(`\n🚀 Running collection: ${collectionName}`);
  console.log(`📁 Collection: ${collectionFile}`);
  console.log(`🌍 Environment: ${environmentFile}`);

  let command = `newman run "${collectionFile}" -e "${environmentFile}"`;

  // Add reporter options
  if (options.reporter === "html") {
    const htmlReport = path.join(
      options.output,
      `${collectionName}-${timestamp}.html`,
    );
    command += ` --reporters cli,html --reporter-html-export "${htmlReport}"`;
    console.log(`📊 HTML Report: ${htmlReport}`);
  } else if (options.reporter === "json") {
    const jsonReport = path.join(
      options.output,
      `${collectionName}-${timestamp}.json`,
    );
    command += ` --reporters cli,json --reporter-json-export "${jsonReport}"`;
    console.log(`📊 JSON Report: ${jsonReport}`);
  }

  // Add other options
  if (options.bail) {
    command += " --bail";
  }

  if (options.verbose) {
    command += " --verbose";
  }

  // Add timeout settings and folder ordering to ensure authentication runs first
  command += " --timeout-request 10000 --timeout-script 5000";

  // Run authentication folder first if collection has one
  if (hasAuthenticationFolder(collectionFile)) {
    command += ' --folder "Authentication"';
    console.log(`🔐 Running Authentication folder first for ${collectionName}`);
  }

  try {
    console.log(`\n▶️  Executing: ${command}\n`);
    execSync(command, { stdio: "inherit" });
    console.log(`\n✅ Collection ${collectionName} completed successfully`);
    return true;
  } catch (error) {
    console.error(`\n❌ Collection ${collectionName} failed`);
    if (options.bail) {
      process.exit(1);
    }
    return false;
  }
}

// Check if a collection has an Authentication folder
function hasAuthenticationFolder(collectionFile) {
  try {
    const collection = JSON.parse(fs.readFileSync(collectionFile, "utf8"));
    return (
      collection.item &&
      collection.item.some(
        (item) => item.name && item.name.toLowerCase() === "authentication",
      )
    );
  } catch (error) {
    console.warn(`Warning: Could not parse collection file ${collectionFile}`);
    return false;
  }
}

// Run authentication-enabled test sequence
function runAuthenticatedTestSequence(
  collectionFile,
  environmentFile,
  options,
) {
  const collectionName = path.basename(
    collectionFile,
    ".postman_collection.json",
  );
  const timestamp = getTimestamp();

  console.log(
    `\n🔐 Running authenticated test sequence for: ${collectionName}`,
  );

  // Step 1: Run Authentication folder only
  if (hasAuthenticationFolder(collectionFile)) {
    let authCommand = `newman run "${collectionFile}" -e "${environmentFile}"`;
    authCommand += ' --folder "Authentication"';
    authCommand += " --timeout-request 10000 --timeout-script 5000";

    if (options.verbose) {
      authCommand += " --verbose";
    }

    console.log(`🔑 Step 1: Authenticating...`);
    try {
      execSync(authCommand, { stdio: "inherit" });
      console.log(`✅ Authentication successful`);
    } catch (error) {
      console.error(`❌ Authentication failed for ${collectionName}`);
      return false;
    }
  }

  // Step 2: Run remaining folders
  let mainCommand = `newman run "${collectionFile}" -e "${environmentFile}"`;

  // Exclude Authentication folder from main run
  if (hasAuthenticationFolder(collectionFile)) {
    const collection = JSON.parse(fs.readFileSync(collectionFile, "utf8"));
    const nonAuthFolders = collection.item
      .filter(
        (item) => item.name && item.name.toLowerCase() !== "authentication",
      )
      .map((item) => `"${item.name}"`);

    if (nonAuthFolders.length > 0) {
      mainCommand += ` --folder ${nonAuthFolders.join(" --folder ")}`;
    }
  }

  // Add reporter options
  if (options.reporter === "html") {
    const htmlReport = path.join(
      options.output,
      `${collectionName}-${timestamp}.html`,
    );
    mainCommand += ` --reporters cli,html --reporter-html-export "${htmlReport}"`;
  } else if (options.reporter === "json") {
    const jsonReport = path.join(
      options.output,
      `${collectionName}-${timestamp}.json`,
    );
    mainCommand += ` --reporters cli,json --reporter-json-export "${jsonReport}"`;
  }

  if (options.bail) {
    mainCommand += " --bail";
  }

  if (options.verbose) {
    mainCommand += " --verbose";
  }

  mainCommand += " --timeout-request 10000 --timeout-script 5000";

  console.log(`📋 Step 2: Running main test suite...`);
  try {
    execSync(mainCommand, { stdio: "inherit" });
    console.log(`✅ Collection ${collectionName} completed successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Collection ${collectionName} failed`);
    return false;
  }
}

// Main function
function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    return;
  }

  console.log("🧪 Antbox API Test Runner");
  console.log("==========================");

  // Check dependencies
  checkNewmanInstallation();

  // Validate options
  validateOptions(options);

  // Ensure reports directory exists
  ensureReportsDirectory(options.output);

  const environmentFile = CONFIG.environments[options.environment];
  const collectionsToRun = options.collection
    ? [
        {
          name: options.collection,
          file: CONFIG.collections[options.collection],
        },
      ]
    : Object.entries(CONFIG.collections).map(([name, file]) => ({
        name,
        file,
      }));

  console.log(`\n📋 Test Plan:`);
  console.log(`   Environment: ${options.environment}`);
  console.log(
    `   Collections: ${collectionsToRun.map((c) => c.name).join(", ")}`,
  );
  console.log(`   Reporter: ${options.reporter}`);
  console.log(`   Output: ${options.output}`);
  console.log(`   Bail on failure: ${options.bail}`);

  // Run collections with authentication-first approach
  const results = [];
  const startTime = Date.now();

  for (const collection of collectionsToRun) {
    let success;

    // Use authenticated test sequence for collections with authentication
    if (hasAuthenticationFolder(collection.file)) {
      success = runAuthenticatedTestSequence(
        collection.file,
        environmentFile,
        options,
      );
    } else {
      success = runCollection(collection.file, environmentFile, options);
    }

    results.push({ name: collection.name, success });

    // Add delay between collections to prevent token conflicts
    if (collectionsToRun.indexOf(collection) < collectionsToRun.length - 1) {
      console.log("⏳ Waiting 2 seconds before next collection...");
      execSync("sleep 2", { stdio: "ignore" });
    }
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  // Summary
  console.log("\n📊 Test Summary");
  console.log("================");
  console.log(`Total time: ${duration}s`);
  console.log(`Collections run: ${results.length}`);
  console.log(`Successful: ${results.filter((r) => r.success).length}`);
  console.log(`Failed: ${results.filter((r) => !r.success).length}`);

  results.forEach((result) => {
    const status = result.success ? "✅" : "❌";
    console.log(`  ${status} ${result.name}`);
  });

  // Exit with error code if any tests failed
  const allPassed = results.every((r) => r.success);
  if (!allPassed) {
    console.log("\n❌ Some tests failed!");
    process.exit(1);
  } else {
    console.log("\n🎉 All tests passed!");
    process.exit(0);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = {
  runCollection,
  runAuthenticatedTestSequence,
  hasAuthenticationFolder,
  parseArgs,
  validateOptions,
  CONFIG,
};
