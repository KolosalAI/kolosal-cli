# KolosalCode Installation Guide

## Quick Install

### One-Line Install (Recommended)

**macOS or Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/KolosalAI/kolosal-cli/main/install.sh | bash
```

**Alternative (using wget):**
```bash
wget -qO- https://raw.githubusercontent.com/KolosalAI/kolosal-cli/main/install.sh | bash
```

**Linux (requires sudo):**
```bash
curl -fsSL https://raw.githubusercontent.com/KolosalAI/kolosal-cli/main/install.sh | sudo bash
```

### Manual Installation

If you prefer to review the script before running:

```bash
# Download the installer
curl -fsSL https://raw.githubusercontent.com/KolosalAI/kolosal-cli/main/install.sh -o install.sh

# Review the script
cat install.sh

# Run the installer
bash install.sh        # macOS
sudo bash install.sh   # Linux
```

## What the Installer Does

The installer will:
1. **Detect your OS** (macOS or Linux)
2. **Download** the appropriate package from GitHub releases
3. **Verify** the package (signature check on macOS)
4. **Install** KolosalCode to your system
5. **Verify** the installation

### Installation Locations

**macOS:**
- Application: `/usr/local/kolosal-app/`
- Binary symlink: `/usr/local/bin/kolosal`
- Configuration: `~/.kolosal/`

**Linux (Debian/Ubuntu):**
- Application: `/usr/local/kolosal-app/` or `/opt/kolosal/`
- Binary: `/usr/bin/kolosal` or `/usr/local/bin/kolosal`
- Configuration: `~/.kolosal/`

## Supported Systems

### macOS
- ✅ macOS 11 (Big Sur) and later
- ✅ Intel (x86_64) and Apple Silicon (arm64)
- ✅ Signed and notarized package

### Linux
- ✅ Ubuntu 20.04+ (Focal and later)
- ✅ Debian 11+ (Bullseye and later)
- ✅ Linux Mint 20+
- ✅ Pop!_OS 20.04+
- ✅ x86_64 (amd64) architecture

## Manual Download

If you prefer to download packages manually:

### macOS Package
```bash
# Download
curl -LO https://github.com/KolosalAI/kolosal-cli/releases/download/v0.1.0-pre/KolosalCode-macos-signed.pkg

# Install
sudo installer -pkg KolosalCode-macos-signed.pkg -target /

# Verify
kolosal --version
```

### Linux Package (Debian/Ubuntu)
```bash
# Download
wget https://github.com/KolosalAI/kolosal-cli/releases/download/v0.1.1-pre/kolosal-code_0.1.1-pre_amd64.deb

# Install
sudo dpkg -i kolosal-code_0.1.1-pre_amd64.deb

# Fix dependencies if needed
sudo apt-get install -f

# Verify
kolosal --version
```

## Verification

After installation, verify it works:

```bash
# Check version
kolosal --version

# Check installation location
which kolosal

# Run help
kolosal --help
```

## Upgrading

To upgrade to a new version, simply run the installer again:

```bash
curl -fsSL https://raw.githubusercontent.com/KolosalAI/kolosal-cli/main/install.sh | bash
```

The installer will detect the existing installation and offer to upgrade.

## Uninstallation

### macOS
```bash
# Run the uninstall script (if available)
sudo /usr/local/kolosal-app/uninstall.sh

# Or manually remove
sudo rm -rf /usr/local/kolosal-app
sudo rm /usr/local/bin/kolosal
rm -rf ~/.kolosal
```

### Linux (Debian/Ubuntu)
```bash
# Using apt
sudo apt remove kolosal-code

# Or using dpkg
sudo dpkg -r kolosal-code

# Remove configuration (optional)
rm -rf ~/.kolosal
```

## Troubleshooting

### "Command not found" after installation

**On macOS:**
```bash
# Check if /usr/local/bin is in your PATH
echo $PATH | grep "/usr/local/bin"

# If not, add it to your shell profile
echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**On Linux:**
```bash
# Refresh hash table
hash -r

# Or restart your terminal
```

### Permission denied on macOS

If you see "cannot be opened because the developer cannot be verified":

1. **If signed and notarized** (should work automatically)
2. **If not notarized:**
   ```bash
   sudo spctl --master-disable
   # Install the package
   sudo spctl --master-enable
   ```
3. **Or right-click the installer and select "Open"**

### dpkg errors on Linux

If you get dependency errors:

```bash
# Fix missing dependencies
sudo apt-get install -f

# Or manually install dependencies
sudo apt-get install nodejs libssl3 libfontconfig1
```

### Signature verification fails on macOS

```bash
# Check the signature
pkgutil --check-signature KolosalCode-macos-signed.pkg

# If it's signed, you should see certificate information
# If verification fails, you can still install at your own risk
```

### Network issues during download

```bash
# Try with wget instead of curl
wget -qO- https://raw.githubusercontent.com/KolosalAI/kolosal-cli/main/install.sh | bash

# Or download manually and run
wget https://raw.githubusercontent.com/KolosalAI/kolosal-cli/main/install.sh
bash install.sh
```

## Building from Source

If you want to build from source instead of using pre-built packages:

```bash
# Clone the repository
git clone https://github.com/KolosalAI/kolosal-cli.git
cd kolosal-cli

# Install dependencies
npm install

# Build
npm run build

# Install globally (optional)
npm link
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed build instructions.

## Requirements

### macOS
- macOS 11.0 (Big Sur) or later
- 200 MB disk space
- Internet connection for first-time setup

### Linux
- Debian-based distribution (Ubuntu, Debian, Linux Mint, etc.)
- glibc 2.31 or later
- 200 MB disk space
- Internet connection for first-time setup

## Security

The macOS package is:
- ✅ Signed with a Developer ID certificate
- ✅ Notarized by Apple
- ✅ Protected by macOS Gatekeeper

The Linux package is:
- ✅ Available from GitHub releases
- ⚠️ Not signed (verify the source)

Always download from official sources:
- GitHub Releases: https://github.com/KolosalAI/kolosal-cli/releases
- Official Website: (if available)

## Support

- **Issues**: https://github.com/KolosalAI/kolosal-cli/issues
- **Documentation**: https://github.com/KolosalAI/kolosal-cli/blob/main/README.md
- **Discussions**: https://github.com/KolosalAI/kolosal-cli/discussions

## License

See [LICENSE](LICENSE) for details.
