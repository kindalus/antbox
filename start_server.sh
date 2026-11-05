#!/bin/bash

# Antbox Server Launcher
# This script wraps main.ts and provides the same argument interface

# Default values
CONFIG_DIR=""
DATA_DIR=""
KEYS_FLAG=""
DEMO_FLAG=""
SANDBOX_FLAG=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --keys)
      KEYS_FLAG="--keys"
      shift
      ;;
    -c|--config-dir)
      CONFIG_DIR="--config-dir $2"
      shift
      shift
      ;;
    -d|--data-dir)
      DATA_DIR="--data-dir $2"
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
      echo "  --keys                  Print crypto keys and exit"
      echo "  -c, --config-dir DIR    Override default server configuration directory [$HOME/.config/antbox]"
      echo "  -d, --data-dir DIR      Override default data directory [$HOME/.local/share/antbox]"
      echo "  --demo                  Run with demo configuration"
      echo "  --sandbox               Run with sandbox configuration"
      echo "  -h, --help              Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                                # Run with default configuration"
      echo "  $0 --demo                         # Run demo server"
      echo "  $0 --sandbox                      # Run sandbox server"
      echo "  $0 -c /etc/antbox -d /var/lib/antbox  # Run with custom directories"
      echo "  $0 --keys                         # Print crypto keys"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Build the bun command
BUN_CMD="bun --no-env-file main.ts"

# Add flags if specified
if [[ -n "$KEYS_FLAG" ]]; then
  BUN_CMD="$BUN_CMD $KEYS_FLAG"
fi

if [[ -n "$CONFIG_DIR" ]]; then
  BUN_CMD="$BUN_CMD $CONFIG_DIR"
fi

if [[ -n "$DATA_DIR" ]]; then
  BUN_CMD="$BUN_CMD $DATA_DIR"
fi

if [[ -n "$DEMO_FLAG" ]]; then
  BUN_CMD="$BUN_CMD $DEMO_FLAG"
fi

if [[ -n "$SANDBOX_FLAG" ]]; then
  BUN_CMD="$BUN_CMD $SANDBOX_FLAG"
fi

# Execute the command
echo "Executing: $BUN_CMD"
exec $BUN_CMD
