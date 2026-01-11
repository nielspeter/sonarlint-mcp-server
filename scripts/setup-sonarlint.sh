#!/bin/bash
# Complete SonarLint Backend Setup Script
# Downloads SLOOP backend with bundled JRE and language plugins

set -e

VERSION="10.32.0.82302"
BACKEND_DIR="./sonarlint-backend"
MAVEN_BASE="https://repo1.maven.org/maven2/org/sonarsource/sonarlint/core/sonarlint-backend-cli/${VERSION}"

echo "🚀 Setting up SonarLint Backend v${VERSION}..."
echo ""

# Check if already installed
if [ -d "$BACKEND_DIR/lib" ] && [ -d "$BACKEND_DIR/jre" ] && [ -d "$BACKEND_DIR/plugins" ]; then
  echo "✅ SonarLint backend already installed"
  echo "   To reinstall, run: rm -rf $BACKEND_DIR && npm run setup"
  exit 0
fi

# Detect OS and architecture
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
  Darwin)
    if [ "$ARCH" = "arm64" ]; then
      DIST_FILE="sonarlint-backend-cli-${VERSION}-macosx_aarch64.tar.gz"
      PLATFORM="macOS ARM64"
    else
      DIST_FILE="sonarlint-backend-cli-${VERSION}-macosx_x64.tar.gz"
      PLATFORM="macOS x64"
    fi
    ;;
  Linux)
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
      DIST_FILE="sonarlint-backend-cli-${VERSION}-linux_aarch64.tar.gz"
      PLATFORM="Linux ARM64"
    else
      DIST_FILE="sonarlint-backend-cli-${VERSION}-linux_x64.tar.gz"
      PLATFORM="Linux x64"
    fi
    ;;
  MINGW*|MSYS*|CYGWIN*)
    DIST_FILE="sonarlint-backend-cli-${VERSION}-windows_x64.zip"
    PLATFORM="Windows x64"
    ;;
  *)
    echo "❌ Unsupported OS: $OS"
    echo "   Supported platforms: macOS (ARM64/x64), Linux (ARM64/x64), Windows (x64)"
    exit 1
    ;;
esac

echo "Platform detected: $PLATFORM"
echo ""

# Clean existing installation
if [ -d "$BACKEND_DIR" ]; then
  echo "🧹 Cleaning existing installation..."
  rm -rf "$BACKEND_DIR"
fi

mkdir -p "$BACKEND_DIR"

echo ""
echo "📦 Step 1/2: Downloading SonarLint Backend..."
echo "   URL: $MAVEN_BASE/$DIST_FILE"
echo ""

# Download the platform-specific distribution
curl -L --progress-bar -o "/tmp/${DIST_FILE}" "$MAVEN_BASE/$DIST_FILE"

echo ""
echo "📂 Extracting backend..."

# Extract (auto-detects tar.gz or zip)
if [[ "$DIST_FILE" == *.zip ]]; then
  unzip -q "/tmp/${DIST_FILE}" -d "/tmp/sonarlint-extract"
else
  mkdir -p "/tmp/sonarlint-extract"
  tar -xzf "/tmp/${DIST_FILE}" -C "/tmp/sonarlint-extract"
fi

# Move extracted contents to backend directory
# The tarball extracts directly to jre/ and lib/ (no parent directory)
mv /tmp/sonarlint-extract/* "$BACKEND_DIR/"
rm -rf "/tmp/sonarlint-extract"
rm "/tmp/${DIST_FILE}"

echo ""
echo "🔌 Step 2/2: Downloading Language Plugins..."
echo ""

PLUGINS_DIR="$BACKEND_DIR/plugins"
mkdir -p "$PLUGINS_DIR"

# JavaScript/TypeScript Plugin (WebStorm 2025.2 compatible)
echo "- JavaScript/TypeScript 11.3.0..."
curl -L --progress-bar -o "$PLUGINS_DIR/sonar-javascript-plugin-11.3.0.34350.jar" \
  "https://repo1.maven.org/maven2/org/sonarsource/javascript/sonar-javascript-plugin/11.3.0.34350/sonar-javascript-plugin-11.3.0.34350.jar"

# Python Plugin
echo "- Python 5.16.0..."
curl -L --progress-bar -o "$PLUGINS_DIR/sonar-python-plugin-5.16.0.29940.jar" \
  "https://repo1.maven.org/maven2/org/sonarsource/python/sonar-python-plugin/5.16.0.29940/sonar-python-plugin-5.16.0.29940.jar"

# Extract eslint-bridge from JavaScript plugin
echo ""
echo "📤 Extracting eslint-bridge..."
cd "$PLUGINS_DIR"
unzip -q sonar-javascript-plugin-11.3.0.34350.jar sonarjs-1.0.0.tgz 2>/dev/null || true
if [ -f sonarjs-1.0.0.tgz ]; then
  mkdir -p eslint-bridge
  tar -xzf sonarjs-1.0.0.tgz -C eslint-bridge
  rm sonarjs-1.0.0.tgz
fi
cd - > /dev/null

echo ""
echo "✅ Setup Complete!"
echo ""
echo "📊 Installation Summary:"
echo "  Platform: $PLATFORM"
echo "  Backend:  $BACKEND_DIR/lib/"
echo "  JRE:      $BACKEND_DIR/jre/"
echo "  Plugins:  $PLUGINS_DIR/"
echo ""
echo "  Installed components:"
ls -1 "$BACKEND_DIR" | sed 's/^/    - /'
echo ""
echo "  Downloaded plugins:"
ls -1 "$PLUGINS_DIR" | grep ".jar$" | sed 's/^/    - /'
echo ""
echo "  Total size: $(du -sh "$BACKEND_DIR" | cut -f1)"
echo ""
echo "✨ Next steps:"
echo "  npm run build"
echo "  npm start"
