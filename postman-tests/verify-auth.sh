#!/bin/bash

# Antbox API Authentication Verification Script
# This script quickly verifies that authentication is properly configured

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="Antbox-Development.postman_environment.json"
COLLECTION_FILE="Antbox-Skills.postman_collection.json"

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if required files exist
check_files() {
    log_info "Checking required files..."

    if [ ! -f "$SCRIPT_DIR/$ENV_FILE" ]; then
        log_error "Environment file not found: $ENV_FILE"
        exit 1
    fi

    if [ ! -f "$SCRIPT_DIR/$COLLECTION_FILE" ]; then
        log_error "Collection file not found: $COLLECTION_FILE"
        exit 1
    fi

    log_success "All required files found"
}

# Check if Newman is installed
check_newman() {
    log_info "Checking Newman installation..."

    if ! command -v newman &> /dev/null; then
        log_error "Newman is not installed. Please install it first:"
        echo "  npm install -g newman"
        exit 1
    fi

    log_success "Newman is installed: $(newman --version)"
}

# Extract configuration from environment file
extract_config() {
    log_info "Extracting configuration..."

    if ! command -v jq &> /dev/null; then
        log_warning "jq not found - using basic parsing"
        BASE_URL=$(grep -o '"base_url"[^}]*"value":"[^"]*"' "$SCRIPT_DIR/$ENV_FILE" | sed 's/.*"value":"\([^"]*\)".*/\1/')
        PASSWORD_HASH=$(grep -o '"root_password_hash"[^}]*"value":"[^"]*"' "$SCRIPT_DIR/$ENV_FILE" | sed 's/.*"value":"\([^"]*\)".*/\1/')
    else
        BASE_URL=$(jq -r '.values[] | select(.key=="base_url") | .value' "$SCRIPT_DIR/$ENV_FILE")
        PASSWORD_HASH=$(jq -r '.values[] | select(.key=="root_password_hash") | .value' "$SCRIPT_DIR/$ENV_FILE")
    fi

    if [ -z "$BASE_URL" ]; then
        log_error "base_url not found in environment"
        exit 1
    fi

    if [ -z "$PASSWORD_HASH" ]; then
        log_error "root_password_hash not found in environment"
        exit 1
    fi

    log_success "Configuration extracted:"
    echo "  Base URL: $BASE_URL"
    echo "  Password hash: ${PASSWORD_HASH:0:16}..."
}

# Test server connectivity
test_connectivity() {
    log_info "Testing server connectivity..."

    if command -v curl &> /dev/null; then
        if curl -s --max-time 10 "$BASE_URL" >/dev/null 2>&1; then
            log_success "Server is reachable at $BASE_URL"
        else
            log_error "Cannot reach server at $BASE_URL"
            log_info "Make sure the Antbox server is running"
            exit 1
        fi
    else
        log_warning "curl not available - skipping connectivity test"
    fi
}

# Test authentication endpoint
test_authentication() {
    log_info "Testing authentication endpoint..."

    if command -v curl &> /dev/null; then
        response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/login/root" \
            -H "Content-Type: text/plain" \
            -d "$PASSWORD_HASH" \
            --max-time 10 2>/dev/null || echo "000")

        http_code="${response: -3}"
        body="${response%???}"

        if [ "$http_code" = "200" ]; then
            log_success "Authentication endpoint working"
            if echo "$body" | grep -q '"jwt"'; then
                log_success "JWT token returned in response"
            else
                log_warning "Response doesn't contain JWT token"
            fi
        else
            log_error "Authentication failed with HTTP $http_code"
            if [ "$http_code" = "401" ]; then
                log_error "Invalid password hash - please check your root_password_hash"
            fi
            exit 1
        fi
    else
        log_warning "curl not available - skipping authentication test"
    fi
}

# Run authentication test with Newman
test_with_newman() {
    log_info "Running authentication test with Newman..."

    cd "$SCRIPT_DIR"

    # Create temporary output file
    temp_output=$(mktemp)

    if newman run "$COLLECTION_FILE" \
        -e "$ENV_FILE" \
        --folder "Authentication" \
        --bail \
        --silent > "$temp_output" 2>&1; then
        log_success "Newman authentication test passed"
    else
        log_error "Newman authentication test failed"
        echo "Newman output:"
        cat "$temp_output"
        rm "$temp_output"
        exit 1
    fi

    rm "$temp_output"
}

# Validate collection structure
validate_collections() {
    log_info "Validating collection structure..."

    # Check if Node.js is available for advanced validation
    if command -v node &> /dev/null; then
        if [ -f "$SCRIPT_DIR/setup-auth-tests.js" ]; then
            log_info "Running comprehensive validation..."
            if node setup-auth-tests.js --validate-only; then
                log_success "Collection validation passed"
            else
                log_error "Collection validation failed"
                exit 1
            fi
        else
            log_warning "setup-auth-tests.js not found - running basic validation"
            # Basic validation using grep
            if grep -q '"Authentication"' "$SCRIPT_DIR"/*.postman_collection.json; then
                log_success "Authentication folders found in collections"
            else
                log_error "No Authentication folders found in collections"
                exit 1
            fi
        fi
    else
        log_warning "Node.js not available - skipping advanced validation"
    fi
}

# Generate password hash helper
generate_hash() {
    log_info "Password hash generator"
    echo "Enter your root password (input will be hidden):"
    read -s password
    echo

    if [ -z "$password" ]; then
        log_error "Password cannot be empty"
        return 1
    fi

    if command -v sha256sum &> /dev/null; then
        hash=$(echo -n "$password" | sha256sum | cut -d' ' -f1)
    elif command -v shasum &> /dev/null; then
        hash=$(echo -n "$password" | shasum -a 256 | cut -d' ' -f1)
    elif command -v openssl &> /dev/null; then
        hash=$(echo -n "$password" | openssl dgst -sha256 | cut -d' ' -f2)
    else
        log_error "No SHA256 tool found (tried sha256sum, shasum, openssl)"
        return 1
    fi

    echo
    log_success "SHA256 hash generated:"
    echo "$hash"
    echo
    log_info "Add this to your environment file:"
    echo '{"key": "root_password_hash", "value": "'$hash'", "type": "secret"}'
}

# Main execution
main() {
    echo "🛡️  Antbox Authentication Verification"
    echo "======================================"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENV_FILE="$2"
                shift 2
                ;;
            --generate-hash)
                generate_hash
                exit 0
                ;;
            --help|-h)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --env <file>        Environment file to use (default: Antbox-Development.postman_environment.json)"
                echo "  --generate-hash     Generate SHA256 hash for password"
                echo "  --help, -h          Show this help"
                echo ""
                echo "Examples:"
                echo "  $0                                    # Quick verification with development environment"
                echo "  $0 --env Antbox-Production.postman_environment.json"
                echo "  $0 --generate-hash                   # Generate password hash"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    log_info "Using environment: $ENV_FILE"
    echo

    # Run verification steps
    check_files
    check_newman
    extract_config
    test_connectivity
    test_authentication
    test_with_newman
    validate_collections

    echo
    log_success "🎉 All authentication verification checks passed!"
    echo
    log_info "Your Postman collections are ready for authenticated testing."
    log_info "Run 'node run-tests.js' to execute the full test suite."
}

# Run main function
main "$@"
