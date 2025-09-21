#!/bin/bash

# Antbox Server Launcher
# This script wraps main.ts and provides the same argument interface

# Default values
CONFIG_FILE=""
KEYS_FLAG=""
DEMO_FLAG=""
SANDBOX_FLAG=""
DENO_ARGS="--allow-net --allow-read --allow-write --allow-env"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --keys)
      KEYS_FLAG="--keys"
      shift
      ;;
    -f|--config)
      CONFIG_FILE="--config $2"
      shift
      shift
      ;;
    --demo)
      DEMO_FLAG="--demo"
      shift
      ;;
    --sandbox)
      SANDBOX_FLAG="--sandbox"
      shift
      ;;
    -h|--help)
      echo "Antbox Server Launcher"
      echo ""
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --keys              Print crypto keys and exit"
      echo "  -f, --config FILE   Override default server configuration file [./.config/antbox.toml]"
      echo "  --demo              Run with demo configuration (demo.toml)"
      echo "  --sandbox           Run with sandbox configuration (sandbox.toml)"
      echo "  -h, --help          Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                            # Run with default configuration"
      echo "  $0 --demo                     # Run demo server"
      echo "  $0 --sandbox                  # Run sandbox server"
      echo "  $0 -f custom.toml             # Run with custom configuration"
      echo "  $0 --keys                     # Print crypto keys"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Build the deno command
DENO_CMD="deno run $DENO_ARGS main.ts"

# Add flags if specified
if [[ -n "$KEYS_FLAG" ]]; then
  DENO_CMD="$DENO_CMD $KEYS_FLAG"
fi

if [[ -n "$CONFIG_FILE" ]]; then
  DENO_CMD="$DENO_CMD $CONFIG_FILE"
fi

if [[ -n "$DEMO_FLAG" ]]; then
  DENO_CMD="$DENO_CMD $DEMO_FLAG"
fi

if [[ -n "$SANDBOX_FLAG" ]]; then
  DENO_CMD="$DENO_CMD $SANDBOX_FLAG"
fi

# Execute the command
echo "Executing: $DENO_CMD"
exec $DENO_CMD
