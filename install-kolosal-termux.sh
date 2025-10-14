#!/data/data/com.termux/files/usr/bin/bash
# Note: Using explicit bash path for Termux compatibility

# Use safer options compatible with dash
set -e
set -u
# Note: pipefail is not available in dash, so we'll handle pipe errors manually where needed

VERSION="1.0.0"
RELEASE_TAG="v${VERSION}"

URL_WIN="https://github.com/KolosalAI/kolosal-cli/releases/download/${RELEASE_TAG}/kolosal-1.0.0-win64.exe"
URL_DEB="https://github.com/KolosalAI/kolosal-cli/releases/download/${RELEASE_TAG}/kolosal_1.0.0_amd64.deb"
URL_DMG_ARM64="https://github.com/KolosalAI/kolosal-cli/releases/download/${RELEASE_TAG}/kolosal_1.0.0_arm64.dmg"

SCRIPT_NAME="$(basename "$0")"
TMP_DIR="$(mktemp -d -t kolosal-install-XXXXXXXX)"
DOWNLOADED_FILE=""
MOUNT_POINT=""

# Headless install defaults
# Set HEADLESS=0 or pass --launch to allow post-install GUI launch (mac) or interactive installer (win)
HEADLESS=1
FORCE_LAUNCH=0

print_usage() {
  cat <<EOF
${SCRIPT_NAME} - Install Kolosal CLI (headless by default)

Usage: ${SCRIPT_NAME} [options]

Options:
  --print-os          Detect and print the inferred OS, then exit
  --headless          Force headless mode (default)
  --launch            Launch application after install (mac) / allow GUI (win)
  --no-color          (Reserved for future) suppress ANSI colors
  -h, --help          Show this help

Environment overrides:
  HEADLESS=0          Same as --launch

Examples:
  curl -fsSL https://.../install-kolosal.sh | bash
  bash install-kolosal.sh --launch
EOF
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --print-os) PRINT_OS=1 ; shift ;;
      --headless) HEADLESS=1 ; FORCE_LAUNCH=0 ; shift ;;
      --launch) HEADLESS=0 ; FORCE_LAUNCH=1 ; shift ;;
      -h|--help) print_usage; exit 0 ;;
      *) echo "Unknown option: $1" >&2; print_usage; exit 1 ;;
    esac
  done
  # Env var override
  if [ "${HEADLESS}" != "0" ] && [ "${HEADLESS}" != "1" ]; then
    HEADLESS=1
  fi
  if [ "${HEADLESS}" = "0" ]; then
    FORCE_LAUNCH=1
  fi
}

cleanup() {
  local ec=$?
  if [ -n "${MOUNT_POINT}" ] && [ -d "${MOUNT_POINT}" ]; then
    # hdiutil is macOS only, so this will only run on macOS
    if command -v hdiutil >/dev/null 2>&1; then
      hdiutil detach "${MOUNT_POINT}" >/dev/null 2>&1 || true
    fi
  fi
  [ -n "${DOWNLOADED_FILE}" ] && [ -f "${DOWNLOADED_FILE}" ] && rm -f "${DOWNLOADED_FILE}" || true
  [ -d "${TMP_DIR}" ] && rm -rf "${TMP_DIR}" || true
  trap - EXIT INT TERM
  exit $ec
}
trap cleanup EXIT INT TERM

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Error: required command '$1' not found." >&2; exit 1; }
}

ensure_sudo() {
  # Termux doesn't use sudo, so we check if we're in Termux first
  if [ -n "${PREFIX:-}" ] && [ "$PREFIX" = "/data/data/com.termux/files/usr" ]; then
    # We're in Termux, no sudo needed
    return 0
  fi

  if [ $(id -u) -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
      sudo -v || { echo "Cannot obtain sudo privileges" >&2; exit 1; }
    else
      echo "This operation requires root privileges, and 'sudo' is not available." >&2
      exit 1
    fi
  fi
}

detect_os() {
  local uname_s
  uname_s="$(uname -s 2>/dev/null || echo unknown)"
  case "$uname_s" in
    Darwin) echo mac; return ;;
    Linux)
      # Check if we're in Termux
      if [ -n "${PREFIX:-}" ] && [ "$PREFIX" = "/data/data/com.termux/files/usr" ]; then
        echo termux; return
      fi

      if [ -f /etc/os-release ]; then
        . /etc/os-release
        case "$(echo "${ID}" | tr '[:upper:]' '[:lower:]')" in
          ubuntu|debian) echo deb; return ;;
        esac
        case " ${ID_LIKE:-} " in
          *debian*) echo deb; return ;;
        esac
      fi
      echo linux-unsupported; return ;;
    MINGW*|MSYS*|CYGWIN*) echo windows; return ;;
    *)
      if [ "${OS:-}" = "Windows_NT" ]; then
        echo windows; return
      fi
      echo unknown; return ;;
  esac
}

download() {
  local url=$1
  local out=$2
  if command -v curl >/dev/null 2>&1; then
    curl -L --fail --progress-bar "$url" -o "$out"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$out" "$url"
  else
    echo "Error: need either curl or wget to download files." >&2
    exit 1
  fi
}

install_termux() {
  echo "Installing Kolosal CLI on Termux..."

  # Check if we're in the project root directory by looking for key project files
  if [ ! -f "CMakeLists.txt" ] || [ ! -f "install-kolosal-termux.sh" ]; then
    echo "Error: This script must be run from the project root directory."
    echo "Please navigate to the project root and run this script again."
    exit 1
  fi

  # Check if the build exists
  if [ ! -f "build/bin/kolosal" ]; then
    echo "Error: Kolosal CLI not built yet. Please build it first with:"
    echo "  mkdir -p build && cd build && cmake .. -DCMAKE_BUILD_TYPE=Release && make -j4"
    exit 1
  fi

  # Create bin directory if it doesn't exist
  mkdir -p "$PREFIX/bin"

  # Copy executables to Termux bin directory
  echo "Copying executables to $PREFIX/bin..."
  if [ -f "build/bin/kolosal" ]; then
    cp build/bin/kolosal "$PREFIX/bin/"
  else
    echo "Warning: build/bin/kolosal not found, skipping..." >&2
  fi
  
  if [ -f "build/bin/kolosal-server" ]; then
    cp build/bin/kolosal-server "$PREFIX/bin/"
  else
    echo "Warning: build/bin/kolosal-server not found, skipping..." >&2
  fi

  # Make sure they're executable (only if they exist)
  if [ -f "$PREFIX/bin/kolosal" ]; then
    chmod +x "$PREFIX/bin/kolosal"
  fi
  if [ -f "$PREFIX/bin/kolosal-server" ]; then
    chmod +x "$PREFIX/bin/kolosal-server"
  fi

  echo "Kolosal CLI installed successfully in Termux!"
  echo "You can now run it with: kolosal"
  echo "For help: kolosal --help"
}

install_mac() {
  need_cmd hdiutil
  local arch
  arch="$(uname -m)"
  if [ "$arch" != "arm64" ]; then
    echo "Warning: Provided DMG is arm64. You're on $arch. Installation may fail." >&2
  fi
  DOWNLOADED_FILE="${TMP_DIR}/kolosal-${VERSION}.dmg"
  echo "Downloading Kolosal (macOS) ..."
  download "$URL_DMG_ARM64" "$DOWNLOADED_FILE"
  echo "Mounting DMG (headless)..."
  # Prefer explicit mountpoint for reliability
  MOUNT_POINT="${TMP_DIR}/mnt"
  mkdir -p "$MOUNT_POINT"
  if ! hdiutil attach -quiet -nobrowse -noautoopen -readonly -mountpoint "$MOUNT_POINT" "$DOWNLOADED_FILE" >/dev/null 2>&1; then
    echo "Primary attach method failed, attempting fallback parsing method..." >&2
    local attach_output
    attach_output=$(hdiutil attach -nobrowse -noautoopen "$DOWNLOADED_FILE" 2>&1 || true)
    echo "--- hdiutil attach output (debug) ---" >&2
    echo "$attach_output" >&2
    echo "-------------------------------------" >&2
    # Try to extract any /Volumes path
    MOUNT_POINT=$(echo "$attach_output" | awk '/\/Volumes\// {for(i=1;i<=NF;i++){if($i ~ /\/Volumes\//){print $i}}}' | tail -1)
    if [ -z "$MOUNT_POINT" ] || [ ! -d "$MOUNT_POINT" ]; then
      # Last resort: query hdiutil info
      MOUNT_POINT=$(hdiutil info | awk -v dmg="$DOWNLOADED_FILE" 'tolower($0) ~ tolower(dmg){capture=1} capture && /\/Volumes\// {for(i=1;i<=NF;i++){if($i ~ /\/Volumes\//){print $i; exit}}}')
    fi
    if [ -z "$MOUNT_POINT" ] || [ ! -d "$MOUNT_POINT" ]; then
      echo "Failed to determine mount point" >&2
      exit 1
    fi
  fi
  echo "Mounted at $MOUNT_POINT"
  local app_path
  app_path=$(find "$MOUNT_POINT" -maxdepth 1 -name '*.app' -type d | head -1 || true)
  if [ -z "$app_path" ]; then
    echo "Could not locate .app bundle inside DMG." >&2
    exit 1
  fi
  local app_name
  app_name="$(basename "$app_path")"
  echo "Found application: $app_name"
  local target_app="/Applications/${app_name}"
  if [ -d "$target_app" ]; then
    echo "Removing existing $target_app"
    ensure_sudo
    sudo rm -rf "$target_app"
  fi
  echo "Copying to /Applications (may require sudo)..."
  if [ -w /Applications ]; then
    cp -R "$app_path" /Applications/
  else
    ensure_sudo
    sudo cp -R "$app_path" /Applications/
  fi
  echo "Detaching DMG..."
  hdiutil detach "$MOUNT_POINT" >/dev/null 2>&1 || true
  MOUNT_POINT=""
  local bin_target="/usr/local/bin/kolosal"
  local app_exec="/Applications/${app_name}/Contents/MacOS/kolosal"
  local bin_server_target="/usr/local/bin/kolosal-server"
  local app_server_exec="/Applications/${app_name}/Contents/MacOS/kolosal-server"
  ensure_sudo
  if [ -x "$app_exec" ]; then
    echo "Creating symlink $bin_target -> $app_exec"
    sudo ln -sf "$app_exec" "$bin_target"
  else
    echo "Creating wrapper script $bin_target that opens the app (binary not found at expected path)."
    sudo tee "$bin_target" >/dev/null <<EOF
#!/usr/bin/env bash
open -a "${app_name%.app}" --args "$@"
EOF
    sudo chmod +x "$bin_target"
  fi

  if [ -x "$app_server_exec" ]; then
    echo "Creating symlink $bin_server_target -> $app_server_exec"
    sudo ln -sf "$app_server_exec" "$bin_server_target"
  else
    # Try to locate an alternative kolosal-server* executable inside the bundle
    alt_server_exec=$(find "/Applications/${app_name}/Contents/MacOS" -maxdepth 1 -type f -perm +111 -name 'kolosal-server*' 2>/dev/null | head -1 || true)
    if [ -n "$alt_server_exec" ]; then
      echo "Found alternate server binary: $alt_server_exec"
      echo "Creating symlink $bin_server_target -> $alt_server_exec"
      sudo ln -sf "$alt_server_exec" "$bin_server_target"
    else
      echo "Notice: kolosal-server binary not found at ($app_server_exec) or via wildcard search." >&2
      echo "Creating fallback wrapper script that attempts to launch server via kolosal if supported." >&2
      sudo tee "$bin_server_target" >/dev/null <<'EOF'
#!/usr/bin/env bash
# Fallback wrapper: try direct kolosal-server if it appears later, else call kolosal with a server subcommand if supported.
if command -v /Applications/Kolosal.app/Contents/MacOS/kolosal-server >/dev/null 2>&1; then
  exec /Applications/Kolosal.app/Contents/MacOS/kolosal-server "$@"
elif command -v kolosal >/dev/null 2>&1; then
  # Attempt a subcommand invocation (adjust if actual server launch syntax differs)
  exec kolosal server "$@"
else
  echo "kolosal-server binary not installed yet. Re-run installer or build from source." >&2
  exit 1
fi
EOF
      sudo chmod +x "$bin_server_target"
    fi
  fi
  if [ $FORCE_LAUNCH -eq 1 ]; then
    echo "Launching application (requested)..."
    open -a "${app_name%.app}" || true
  else
    echo "Headless install complete. To launch GUI later: open -a ${app_name%.app}"
  fi
  echo "Kolosal installed. Test CLI with: kolosal --help"
}

install_deb() {
  need_cmd dpkg
  DOWNLOADED_FILE="${TMP_DIR}/kolosal_${VERSION}_amd64.deb"
  echo "Downloading Kolosal (.deb)..."
  download "$URL_DEB" "$DOWNLOADED_FILE"
  ensure_sudo
  echo "Installing .deb package..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y || true
    sudo apt-get install -y "./$(basename "$DOWNLOADED_FILE")" 2>/dev/null || {
      sudo dpkg -i "$DOWNLOADED_FILE" || true
      sudo apt-get -f install -y
    }
  else
    sudo dpkg -i "$DOWNLOADED_FILE" || {
      echo "dpkg reported issues. Resolve dependencies manually." >&2
    }
  fi
  echo "Kolosal installed. Test with: kolosal --help"
}

install_windows_note() {
  echo "Windows environment detected." >&2
  DOWNLOADED_FILE="${TMP_DIR}/kolosal-${VERSION}-win64.exe"
  echo "Downloading Kolosal (Windows installer) ..." >&2
  download "$URL_WIN" "$DOWNLOADED_FILE"
  if ! command -v cmd.exe >/dev/null 2>&1; then
    echo "cmd.exe not available; manual install required: $DOWNLOADED_FILE" >&2
    return 0
  fi
  local win_path
  win_path=$(printf '%s' "$DOWNLOADED_FILE" | sed 's|/|\\|g')
  if [ $FORCE_LAUNCH -eq 1 ]; then
    echo "Launching interactive installer (requested)..." >&2
    cmd.exe /c start "KolosalInstaller" "$win_path" || true
  else
    echo "Attempting silent install (/S)..." >&2
    # Run directly (no start) so we can wait; wrap in quotes
    cmd.exe /c "\"$win_path\" /S" || {
      echo "Silent mode may not be supported. Re-run with --launch for GUI or execute installer manually." >&2
    }
  fi
  echo "Kolosal installation process triggered. After completion, open a new shell and run: kolosal --help" >&2
}

main() {
  PRINT_OS=0
  parse_args "$@"
  if [ "${PRINT_OS:-0}" -eq 1 ]; then
    detect_os; exit 0
  fi
  local os
  os=$(detect_os)
  echo "Detected OS: $os (headless=${HEADLESS})"
  case "$os" in
    termux) install_termux ;;
    mac) install_mac ;;
    deb) install_deb ;;
    windows) install_windows_note ;;
    linux-unsupported)
      echo "Unsupported Linux distribution. Only Debian/Ubuntu (.deb) installation automated." >&2
      exit 2 ;;
    unknown)
      echo "Could not determine OS. Exiting." >&2
      exit 2 ;;
  esac
}

main "$@"