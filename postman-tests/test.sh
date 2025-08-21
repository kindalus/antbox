#!/bin/bash

# Antbox API Test Runner Script
# Simple shell script for running Postman tests locally

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="development"
COLLECTION=""
REPORTER="cli"
OUTPUT_DIR="./reports"
BAIL=false
VERBOSE=false

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to show usage
show_usage() {
    cat << EOF
🧪 Antbox API Test Runner

Usage: $0 [OPTIONS]

OPTIONS:
    -e, --env ENVIRONMENT      Environment to use (development|production)
                              Default: development

    -c, --collection NAME      Specific collection to run (skills|nodes|aspects)
                              Default: all collections

    -r, --reporter TYPE        Reporter type (cli|html|json)
                              Default: cli

    -o, --output DIR          Output directory for reports
                              Default: ./reports

    -b, --bail                Stop on first failure

    -v, --verbose             Verbose output

    -h, --help                Show this help message

EXAMPLES:
    $0                                    # Run all collections with development environment
    $0 -e production                      # Run with production environment
    $0 -c skills -r html                  # Run skills collection with HTML report
    $0 -v -b                             # Verbose output with bail on failure
    $0 -c skills -o ./my-reports         # Run skills collection, output to custom directory

AVAILABLE COLLECTIONS:
    skills     Skills management and functional operations
    nodes      Node management and content operations
    aspects    Aspect management and operations

AVAILABLE ENVIRONMENTS:
    development    Local development server (localhost:7180)
    production     Production server configuration

EOF
}

# Function to check if Newman is installed
check_newman() {
    if ! command -v newman &> /dev/null; then
        print_error "Newman is not installed!"
        echo "Please install Newman first:"
        echo "  npm install -g newman"
        echo "  npm install -g newman-reporter-html  # For HTML reports"
        exit 1
    fi
}

# Function to check if files exist
check_files() {
    local env_file=""
    case $ENVIRONMENT in
        "development")
            env_file="Antbox-Development.postman_environment.json"
            ;;
        "production")
            env_file="Antbox-Production.postman_environment.json"
            ;;
        *)
            print_error "Invalid environment: $ENVIRONMENT"
            echo "Available environments: development, production"
            exit 1
            ;;
    esac

    if [ ! -f "$env_file" ]; then
        print_error "Environment file not found: $env_file"
        exit 1
    fi

    if [ -n "$COLLECTION" ]; then
        local collection_file=""
        case $COLLECTION in
            "skills")
                collection_file="Antbox-Skills.postman_collection.json"
                ;;
            "nodes")
                collection_file="Antbox-Nodes.postman_collection.json"
                ;;
            "aspects")
                collection_file="Antbox-Aspects.postman_collection.json"
                ;;
            *)
                print_error "Invalid collection: $COLLECTION"
                echo "Available collections: skills, nodes, aspects"
                exit 1
                ;;
        esac

        if [ ! -f "$collection_file" ]; then
            print_error "Collection file not found: $collection_file"
            exit 1
        fi
    else
        # Check all collection files exist
        local collections=("Antbox-Skills.postman_collection.json" "Antbox-Nodes.postman_collection.json" "Antbox-Aspects.postman_collection.json")
        for collection in "${collections[@]}"; do
            if [ ! -f "$collection" ]; then
                print_error "Collection file not found: $collection"
                exit 1
            fi
        done
    fi
}

# Function to ensure output directory exists
ensure_output_dir() {
    if [ ! -d "$OUTPUT_DIR" ]; then
        mkdir -p "$OUTPUT_DIR"
        print_info "Created output directory: $OUTPUT_DIR"
    fi
}

# Function to run a single collection
run_collection() {
    local collection_file=$1
    local collection_name=$2
    local env_file=$3

    print_info "Running collection: $collection_name"
    print_info "Collection file: $collection_file"
    print_info "Environment file: $env_file"

    local newman_cmd="newman run \"$collection_file\" -e \"$env_file\""

    # Add reporter options
    case $REPORTER in
        "html")
            local timestamp=$(date +"%Y%m%d_%H%M%S")
            local html_report="$OUTPUT_DIR/${collection_name}-${timestamp}.html"
            newman_cmd+=" --reporters cli,html --reporter-html-export \"$html_report\""
            print_info "HTML report will be saved to: $html_report"
            ;;
        "json")
            local timestamp=$(date +"%Y%m%d_%H%M%S")
            local json_report="$OUTPUT_DIR/${collection_name}-${timestamp}.json"
            newman_cmd+=" --reporters cli,json --reporter-json-export \"$json_report\""
            print_info "JSON report will be saved to: $json_report"
            ;;
    esac

    # Add other options
    if [ "$BAIL" = true ]; then
        newman_cmd+=" --bail"
    fi

    if [ "$VERBOSE" = true ]; then
        newman_cmd+=" --verbose"
    fi

    # Add timeout settings
    newman_cmd+=" --timeout-request 10000 --timeout-script 5000"

    # Execute command
    echo
    print_info "Executing: $newman_cmd"
    echo

    if eval "$newman_cmd"; then
        print_success "Collection $collection_name completed successfully"
        return 0
    else
        print_error "Collection $collection_name failed"
        return 1
    fi
}

# Function to check API server availability
check_api_server() {
    local base_url=""
    case $ENVIRONMENT in
        "development")
            base_url="http://localhost:7180"
            ;;
        "production")
            base_url="https://api.antbox.com"  # Update with actual production URL
            ;;
    esac

    print_info "Checking API server availability at $base_url"

    if command -v curl &> /dev/null; then
        if curl -s -f "$base_url/health" > /dev/null 2>&1; then
            print_success "API server is responding"
        else
            print_warning "API server may not be available at $base_url"
            print_warning "Please ensure the Antbox API server is running"
        fi
    elif command -v wget &> /dev/null; then
        if wget -q --spider "$base_url/health" 2>/dev/null; then
            print_success "API server is responding"
        else
            print_warning "API server may not be available at $base_url"
            print_warning "Please ensure the Antbox API server is running"
        fi
    else
        print_warning "Cannot check API server availability (curl or wget not found)"
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -c|--collection)
            COLLECTION="$2"
            shift 2
            ;;
        -r|--reporter)
            REPORTER="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -b|--bail)
            BAIL=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use -h or --help for usage information"
            exit 1
            ;;
    esac
done

# Main execution
main() {
    echo "🧪 Antbox API Test Runner"
    echo "========================="

    # Validate inputs
    check_newman
    check_files
    ensure_output_dir

    # Check API server
    check_api_server

    # Get environment file
    local env_file=""
    case $ENVIRONMENT in
        "development")
            env_file="Antbox-Development.postman_environment.json"
            ;;
        "production")
            env_file="Antbox-Production.postman_environment.json"
            ;;
    esac

    # Determine collections to run
    local collections_to_run=()
    if [ -n "$COLLECTION" ]; then
        case $COLLECTION in
            "skills")
                collections_to_run+=("Antbox-Skills.postman_collection.json:skills")
                ;;
            "nodes")
                collections_to_run+=("Antbox-Nodes.postman_collection.json:nodes")
                ;;
            "aspects")
                collections_to_run+=("Antbox-Aspects.postman_collection.json:aspects")
                ;;
        esac
    else
        collections_to_run+=(
            "Antbox-Skills.postman_collection.json:skills"
            "Antbox-Nodes.postman_collection.json:nodes"
            "Antbox-Aspects.postman_collection.json:aspects"
        )
    fi

    # Display test plan
    echo
    print_info "Test Plan:"
    echo "   Environment: $ENVIRONMENT"
    echo "   Collections: $(IFS=,; echo "${collections_to_run[*]}" | sed 's/:[^,]*//g' | sed 's/Antbox-//g' | sed 's/.postman_collection.json//g')"
    echo "   Reporter: $REPORTER"
    echo "   Output: $OUTPUT_DIR"
    echo "   Bail on failure: $BAIL"
    echo "   Verbose: $VERBOSE"

    # Run collections
    local results=()
    local start_time=$(date +%s)

    for collection_entry in "${collections_to_run[@]}"; do
        IFS=':' read -r collection_file collection_name <<< "$collection_entry"

        if run_collection "$collection_file" "$collection_name" "$env_file"; then
            results+=("$collection_name:SUCCESS")
        else
            results+=("$collection_name:FAILED")
            if [ "$BAIL" = true ]; then
                print_error "Stopping execution due to --bail option"
                break
            fi
        fi
        echo
    done

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Display summary
    echo
    echo "📊 Test Summary"
    echo "==============="
    echo "Total time: ${duration}s"
    echo "Collections run: ${#results[@]}"

    local successful=0
    local failed=0

    for result in "${results[@]}"; do
        IFS=':' read -r name status <<< "$result"
        if [ "$status" = "SUCCESS" ]; then
            print_success "$name"
            ((successful++))
        else
            print_error "$name"
            ((failed++))
        fi
    done

    echo "Successful: $successful"
    echo "Failed: $failed"

    # Exit with appropriate code
    if [ $failed -gt 0 ]; then
        echo
        print_error "Some tests failed!"
        exit 1
    else
        echo
        print_success "All tests passed!"
        exit 0
    fi
}

# Run main function
main "$@"
