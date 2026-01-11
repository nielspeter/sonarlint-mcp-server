#!/bin/bash
# Complete SonarLint Backend Setup Script
# Downloads SLOOP backend with bundled JRE and language plugins

set -e

VERSION="10.32.0.82302"
BACKEND_DIR="./sonarlint-backend"
MAVEN_BASE="https://repo1.maven.org/maven2/org/sonarsource/sonarlint/core/sonarlint-backend-cli/${VERSION}"

JS_PLUGIN_VERSION="11.3.0.34350"
PYTHON_PLUGIN_VERSION="5.16.0.29940"

echo "Setting up SonarLint Backend v${VERSION}..."
echo ""

if [ -d "$BACKEND_DIR/lib" ] && [ -d "$BACKEND_DIR/jre" ] && [ -d "$BACKEND_DIR/plugins" ]; then
  echo "SonarLint backend already installed"
  echo "   To reinstall, run: rm -rf $BACKEND_DIR && npm run setup"
  exit 0
fi

OS=$(uname -s)
ARCH=$(uname -m)
IS_WINDOWS=false

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
    IS_WINDOWS=true
    ;;
  *)
    echo "ERROR: Unsupported OS: $OS"
    echo "   Supported platforms: macOS (ARM64/x64), Linux (ARM64/x64), Windows (x64)"
    exit 1
    ;;
esac

echo "Platform detected: $PLATFORM"
echo ""

if [ -d "$BACKEND_DIR" ]; then
  echo "Cleaning existing installation..."
  rm -rf "$BACKEND_DIR"
fi

mkdir -p "$BACKEND_DIR"

echo ""
echo "Step 1/3: Downloading SonarLint Backend..."
echo "   URL: $MAVEN_BASE/$DIST_FILE"
echo ""

TEMP_DIR=$(mktemp -d)
EXTRACT_DIR="$TEMP_DIR/extract"
mkdir -p "$EXTRACT_DIR"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

curl -L --progress-bar -o "$TEMP_DIR/${DIST_FILE}" "$MAVEN_BASE/$DIST_FILE"

echo ""
echo "Extracting backend..."

if [[ "$DIST_FILE" == *.zip ]]; then
  if ! command -v unzip &> /dev/null; then
    echo "ERROR: 'unzip' is required but not installed"
    exit 1
  fi
  unzip -q "$TEMP_DIR/${DIST_FILE}" -d "$EXTRACT_DIR"
else
  tar -xzf "$TEMP_DIR/${DIST_FILE}" -C "$EXTRACT_DIR"
fi

SOURCE_DIR=""
if [ -d "$EXTRACT_DIR/jre" ] && [ -d "$EXTRACT_DIR/lib" ]; then
  SOURCE_DIR="$EXTRACT_DIR"
else
  SUBDIR_COUNT=$(find "$EXTRACT_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  if [ "$SUBDIR_COUNT" -eq 1 ]; then
    SINGLE_DIR=$(find "$EXTRACT_DIR" -mindepth 1 -maxdepth 1 -type d)
    if [ -d "$SINGLE_DIR/jre" ] && [ -d "$SINGLE_DIR/lib" ]; then
      SOURCE_DIR="$SINGLE_DIR"
    fi
  fi
fi

if [ -z "$SOURCE_DIR" ]; then
  echo "ERROR: Unexpected archive layout. Expected jre/ and lib/ directories."
  echo "Archive contents:"
  ls -la "$EXTRACT_DIR"
  exit 1
fi

mv "$SOURCE_DIR"/* "$BACKEND_DIR/"

echo ""
echo "Step 2/3: Validating backend installation..."

JAR_COUNT=$(find "$BACKEND_DIR/lib" -name "*.jar" 2>/dev/null | wc -l | tr -d ' ')
if [ "$JAR_COUNT" -lt 10 ]; then
  echo "ERROR: Backend lib/ directory missing or incomplete (found $JAR_COUNT JARs, expected 50+)"
  exit 1
fi
echo "   lib/: $JAR_COUNT JARs"

JAVA_PATH=""
if [ "$IS_WINDOWS" = true ]; then
  if [ -f "$BACKEND_DIR/jre/bin/java.exe" ]; then
    JAVA_PATH="$BACKEND_DIR/jre/bin/java.exe"
  elif [ -f "$BACKEND_DIR/jre/bin/java" ]; then
    JAVA_PATH="$BACKEND_DIR/jre/bin/java"
  fi
else
  if [ -f "$BACKEND_DIR/jre/bin/java" ]; then
    JAVA_PATH="$BACKEND_DIR/jre/bin/java"
  fi
fi

if [ -z "$JAVA_PATH" ]; then
  echo "ERROR: JRE not found at $BACKEND_DIR/jre/bin/java"
  exit 1
fi
echo "   jre/: $(basename "$JAVA_PATH") found"

echo ""
echo "Step 3/3: Downloading Language Plugins..."
echo ""

PLUGINS_DIR="$BACKEND_DIR/plugins"
mkdir -p "$PLUGINS_DIR"

JS_PLUGIN="sonar-javascript-plugin-${JS_PLUGIN_VERSION}.jar"
echo "- JavaScript/TypeScript ${JS_PLUGIN_VERSION%.*}..."
curl -L --progress-bar -o "$PLUGINS_DIR/$JS_PLUGIN" \
  "https://repo1.maven.org/maven2/org/sonarsource/javascript/sonar-javascript-plugin/${JS_PLUGIN_VERSION}/$JS_PLUGIN"

PYTHON_PLUGIN="sonar-python-plugin-${PYTHON_PLUGIN_VERSION}.jar"
echo "- Python ${PYTHON_PLUGIN_VERSION%.*}..."
curl -L --progress-bar -o "$PLUGINS_DIR/$PYTHON_PLUGIN" \
  "https://repo1.maven.org/maven2/org/sonarsource/python/sonar-python-plugin/${PYTHON_PLUGIN_VERSION}/$PYTHON_PLUGIN"

echo ""
echo "Validating plugins..."

JS_SIZE=$(stat -f%z "$PLUGINS_DIR/$JS_PLUGIN" 2>/dev/null || stat -c%s "$PLUGINS_DIR/$JS_PLUGIN" 2>/dev/null || echo "0")
if [ "$JS_SIZE" -lt 1000000 ]; then
  echo "ERROR: JavaScript plugin download failed or incomplete (size: $JS_SIZE bytes)"
  exit 1
fi
echo "   $JS_PLUGIN: $(( JS_SIZE / 1024 / 1024 ))MB"

PYTHON_SIZE=$(stat -f%z "$PLUGINS_DIR/$PYTHON_PLUGIN" 2>/dev/null || stat -c%s "$PLUGINS_DIR/$PYTHON_PLUGIN" 2>/dev/null || echo "0")
if [ "$PYTHON_SIZE" -lt 1000000 ]; then
  echo "ERROR: Python plugin download failed or incomplete (size: $PYTHON_SIZE bytes)"
  exit 1
fi
echo "   $PYTHON_PLUGIN: $(( PYTHON_SIZE / 1024 / 1024 ))MB"

echo ""
echo "Extracting eslint-bridge..."
cd "$PLUGINS_DIR"
unzip -q "$JS_PLUGIN" sonarjs-1.0.0.tgz 2>/dev/null || true
if [ -f sonarjs-1.0.0.tgz ]; then
  mkdir -p eslint-bridge
  tar -xzf sonarjs-1.0.0.tgz -C eslint-bridge
  rm sonarjs-1.0.0.tgz
fi
cd - > /dev/null

if [ ! -f "$PLUGINS_DIR/eslint-bridge/package/bin/server.cjs" ]; then
  echo "WARNING: eslint-bridge extraction may have failed"
  echo "   Expected: $PLUGINS_DIR/eslint-bridge/package/bin/server.cjs"
fi

echo ""
echo "Setup Complete!"
echo ""
echo "Installation Summary:"
echo "  Platform: $PLATFORM"
echo "  Backend:  $BACKEND_DIR/lib/ ($JAR_COUNT JARs)"
echo "  JRE:      $JAVA_PATH"
echo "  Plugins:  $PLUGINS_DIR/"
echo ""
echo "  Downloaded plugins:"
ls -1 "$PLUGINS_DIR" | grep ".jar$" | sed 's/^/    - /'
echo ""
echo "  Total size: $(du -sh "$BACKEND_DIR" | cut -f1)"
echo ""
echo "Next steps:"
echo "  npm run build"
echo "  npm start"
