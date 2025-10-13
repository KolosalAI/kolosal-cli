#!/bin/bash

##
# KolosalCode Universal Installer
# Automatically detects OS and installs the appropriate package
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/KolosalAI/kolosal-cli/main/install.sh | bash
#   or
#   wget -qO- https://raw.githubusercontent.com/KolosalAI/kolosal-cli/main/install.sh | bash
##

set -e

# Version to install
VERSION="${VERSION:-0.1.0-pre}"
PACKAGE_VERSION="0.1.1-pre"

# GitHub release URLs
GITHUB_REPO="KolosalAI/kolosal-cli"
MACOS_PKG_URL="https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}/KolosalCode-macos-signed.pkg"
LINUX_DEB_URL="https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}/kolosal-code_${PACKAGE_VERSION}_amd64.deb"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Print functions
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC}  $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_header() {
    echo ""
    echo -e "${BOLD}$1${NC}"
    echo "================================"
}

# Detect OS
detect_os() {
    local os_name=""
    local os_arch=""
    
    # Detect OS type
    case "$(uname -s)" in
        Darwin*)
            os_name="macos"
            ;;
        Linux*)
            os_name="linux"
            ;;
        *)
            print_error "Unsupported operating system: $(uname -s)"
            print_info "KolosalCode currently supports macOS and Linux"
            exit 1
            ;;
    esac
    
    # Detect architecture
    case "$(uname -m)" in
        x86_64|amd64)
            os_arch="amd64"
            ;;
        arm64|aarch64)
            os_arch="arm64"
            ;;
        *)
            print_warning "Unsupported architecture: $(uname -m)"
            print_info "Attempting to install anyway..."
            os_arch="amd64"
            ;;
    esac
    
    echo "${os_name}:${os_arch}"
}

# Check if running as root (for Linux)
check_root() {
    if [ "$EUID" -ne 0 ] && [ "$1" = "linux" ]; then
        print_error "This script must be run with sudo on Linux"
        echo ""
        echo "Please run:"
        echo "  curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/install.sh | sudo bash"
        echo ""
        echo "Or download and run manually:"
        echo "  wget https://raw.githubusercontent.com/${GITHUB_REPO}/main/install.sh"
        echo "  sudo bash install.sh"
        exit 1
    fi
}

# Download file
download_file() {
    local url="$1"
    local output="$2"
    
    print_info "Downloading from: $url"
    
    # Try curl first, then wget
    if command -v curl &> /dev/null; then
        curl -fsSL -o "$output" "$url" || {
            print_error "Download failed"
            return 1
        }
    elif command -v wget &> /dev/null; then
        wget -q -O "$output" "$url" || {
            print_error "Download failed"
            return 1
        }
    else
        print_error "Neither curl nor wget is available"
        print_info "Please install curl or wget and try again"
        return 1
    fi
    
    print_success "Download complete"
}

# Install on macOS
install_macos() {
    print_header "Installing KolosalCode on macOS"
    
    local tmp_dir=$(mktemp -d)
    local pkg_file="${tmp_dir}/KolosalCode.pkg"
    
    # Download the package
    if ! download_file "$MACOS_PKG_URL" "$pkg_file"; then
        print_error "Failed to download macOS package"
        rm -rf "$tmp_dir"
        exit 1
    fi
    
    # Verify the download
    if [ ! -f "$pkg_file" ]; then
        print_error "Package file not found after download"
        rm -rf "$tmp_dir"
        exit 1
    fi
    
    print_info "Package size: $(du -h "$pkg_file" | cut -f1)"
    
    # Check signature
    print_info "Verifying package signature..."
    if pkgutil --check-signature "$pkg_file" &> /dev/null; then
        print_success "Package signature verified"
    else
        print_warning "Package signature could not be verified"
        print_info "This might happen if the package is not notarized"
        read -p "Continue with installation? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Installation cancelled"
            rm -rf "$tmp_dir"
            exit 0
        fi
    fi
    
    # Install the package
    print_info "Installing KolosalCode..."
    print_info "You may be prompted for your password"
    
    if sudo installer -pkg "$pkg_file" -target /; then
        print_success "Installation complete!"
    else
        print_error "Installation failed"
        rm -rf "$tmp_dir"
        exit 1
    fi
    
    # Clean up
    rm -rf "$tmp_dir"
    
    # Verify installation
    if command -v kolosal &> /dev/null; then
        print_success "KolosalCode is now installed"
        echo ""
        print_info "Installed version: $(kolosal --version 2>&1 | head -1)"
        print_info "Installed location: $(which kolosal)"
    else
        print_warning "Installation completed but 'kolosal' command not found in PATH"
        print_info "You may need to add /usr/local/bin to your PATH"
        print_info "Or restart your terminal"
    fi
}

# Install on Linux
install_linux() {
    print_header "Installing KolosalCode on Linux"
    
    # Detect Linux distribution
    local distro=""
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        distro="$ID"
    elif [ -f /etc/debian_version ]; then
        distro="debian"
    elif [ -f /etc/redhat-release ]; then
        distro="redhat"
    else
        print_warning "Could not detect Linux distribution"
        distro="unknown"
    fi
    
    print_info "Detected distribution: $distro"
    
    # Check if it's a Debian-based system
    if [[ "$distro" != "debian" && "$distro" != "ubuntu" && "$distro" != "linuxmint" && "$distro" != "pop" ]]; then
        print_warning "This installer provides .deb packages for Debian/Ubuntu-based systems"
        print_info "For other distributions, please download and install manually from:"
        print_info "$LINUX_DEB_URL"
        exit 1
    fi
    
    local tmp_dir=$(mktemp -d)
    local deb_file="${tmp_dir}/kolosal-code.deb"
    
    # Download the package
    if ! download_file "$LINUX_DEB_URL" "$deb_file"; then
        print_error "Failed to download Linux package"
        rm -rf "$tmp_dir"
        exit 1
    fi
    
    # Verify the download
    if [ ! -f "$deb_file" ]; then
        print_error "Package file not found after download"
        rm -rf "$tmp_dir"
        exit 1
    fi
    
    print_info "Package size: $(du -h "$deb_file" | cut -f1)"
    
    # Install the package
    print_info "Installing KolosalCode..."
    
    if dpkg -i "$deb_file" 2>&1 | tee /tmp/kolosal-install.log; then
        print_success "Installation complete!"
    else
        print_warning "Installation had some warnings"
        
        # Try to fix dependencies
        print_info "Attempting to fix dependencies..."
        if apt-get install -f -y; then
            print_success "Dependencies fixed"
        else
            print_error "Could not fix dependencies automatically"
            print_info "Please run: sudo apt-get install -f"
        fi
    fi
    
    # Clean up
    rm -rf "$tmp_dir"
    
    # Verify installation
    if command -v kolosal &> /dev/null; then
        print_success "KolosalCode is now installed"
        echo ""
        print_info "Installed version: $(kolosal --version 2>&1 | head -1)"
        print_info "Installed location: $(which kolosal)"
    else
        print_warning "Installation completed but 'kolosal' command not found in PATH"
        print_info "Try running: hash -r"
        print_info "Or restart your terminal"
    fi
}

# Show usage instructions
show_usage() {
    echo ""
    print_header "Quick Start"
    echo ""
    echo "Try running:"
    echo -e "  ${BOLD}kolosal --help${NC}"
    echo ""
    echo "To check the version:"
    echo -e "  ${BOLD}kolosal --version${NC}"
    echo ""
    echo "For more information, visit:"
    echo "  https://github.com/${GITHUB_REPO}"
    echo ""
}

# Uninstall function (for reference)
show_uninstall_info() {
    echo ""
    print_header "Uninstallation"
    echo ""
    
    if [ "$(uname -s)" = "Darwin" ]; then
        echo "To uninstall on macOS:"
        echo "  sudo rm -rf /usr/local/kolosal-app"
        echo "  sudo rm /usr/local/bin/kolosal"
    else
        echo "To uninstall on Linux:"
        echo "  sudo apt remove kolosal-code"
        echo "  # or"
        echo "  sudo dpkg -r kolosal-code"
    fi
    echo ""
}

# Main installation flow
main() {
    print_header "KolosalCode Installer v${VERSION}"
    echo ""
    
    # Detect OS and architecture
    print_info "Detecting operating system..."
    local os_info=$(detect_os)
    local os_name=$(echo "$os_info" | cut -d: -f1)
    local os_arch=$(echo "$os_info" | cut -d: -f2)
    
    print_success "Detected: $os_name ($os_arch)"
    echo ""
    
    # Check if already installed
    if command -v kolosal &> /dev/null; then
        local current_version=$(kolosal --version 2>&1 | head -1)
        print_warning "KolosalCode is already installed"
        print_info "Current version: $current_version"
        echo ""
        read -p "Do you want to reinstall/upgrade? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Installation cancelled"
            exit 0
        fi
    fi
    
    # Install based on OS
    case "$os_name" in
        macos)
            install_macos
            ;;
        linux)
            check_root "$os_name"
            install_linux
            ;;
        *)
            print_error "Unsupported OS: $os_name"
            exit 1
            ;;
    esac
    
    # Show usage instructions
    show_usage
    
    # Show uninstall info
    if [ "${SHOW_UNINSTALL_INFO:-0}" = "1" ]; then
        show_uninstall_info
    fi
    
    print_success "Installation completed successfully!"
}

# Run main function
main "$@"
