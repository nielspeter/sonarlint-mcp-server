# Troubleshooting Guide

This guide covers common issues and solutions for the SonarLint MCP Server.

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Claude Desktop Connection](#claude-desktop-connection)
3. [Analysis Problems](#analysis-problems)
4. [Performance Issues](#performance-issues)
5. [Plugin Issues](#plugin-issues)
6. [Java/Node.js Issues](#javanode-js-issues)
7. [Debugging](#debugging)

## Installation Issues

### "Cannot find module" errors

**Problem**: `Error: Cannot find module '@modelcontextprotocol/sdk'`

**Solution**:
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Build fails with TypeScript errors

**Problem**: `npm run build` fails with compilation errors

**Solution**:
```bash
# Check Node.js version (must be 22.7.5+)
node --version

# Clean and rebuild
rm -rf dist/
npm run build

# If issues persist, check TypeScript version
npm list typescript
# Should be 5.3.0 or higher

# Reinstall dependencies if needed
rm -rf node_modules package-lock.json
npm install
```

### Plugins not downloaded

**Problem**: `sonarlint-backend/` directory is empty or missing plugins

**Solution**:
```bash
# The postinstall script runs automatically during npm install
# If it didn't run or failed, manually run:
npm run setup

# Verify backend directory structure
ls -la sonarlint-backend/
# Should show: lib/, jre/, plugins/

# Verify plugins exist
ls -la sonarlint-backend/plugins/
# Should show:
#   - sonar-javascript-plugin-11.3.0.34350.jar
#   - sonar-python-plugin-5.9.0.23806.jar
#   - eslint-bridge/
```

## Claude Desktop Connection

### MCP server not showing up in Claude

**Problem**: Claude doesn't show SonarLint tools available

**Solution**:

1. **Verify configuration path**:
   ```bash
   # macOS
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

   # Linux
   cat ~/.config/Claude/claude_desktop_config.json

   # Check the path is ABSOLUTE, not relative
   # ❌ Wrong: "./dist/index.js"
   # ✅ Correct: "/Users/yourname/projects/sonarlint-mcp-server/dist/index.js"
   ```

2. **Check the file exists**:
   ```bash
   # Use the EXACT path from your config
   ls -la /full/path/to/sonarlint-mcp-server/dist/index.js
   ```

3. **Restart Claude Desktop completely**:
   - Quit Claude Desktop (Cmd+Q on macOS)
   - Wait 5 seconds
   - Restart Claude Desktop

4. **Check Claude Desktop logs**:
   ```bash
   # macOS
   tail -f ~/Library/Logs/Claude/mcp*.log

   # Look for errors related to "sonarlint" server
   ```

### Server starts but tools not available

**Problem**: Server connects but Claude can't use the tools

**Solution**:

1. **Run tests to verify server**:
   ```bash
   npm test
   ```

   If tests fail, there's a server issue. If they pass, it's a Claude connection problem.

2. **Check server can start**:
   ```bash
   # Run server directly to see output
   node dist/index.js
   # Should start without errors and wait for stdio input
   # Press Ctrl+C to stop
   ```

3. **Verify MCP SDK version**:
   ```bash
   npm list @modelcontextprotocol/sdk
   # Should be 1.21.1 or higher
   ```

### "Server crashed" or "Server not responding"

**Problem**: Claude shows server errors

**Solution**:

1. **Check for running servers**:
   ```bash
   # Kill any stuck servers
   pkill -f "node dist/index.js"
   ```

2. **Check memory usage**:
   ```bash
   # SLOOP backend can use 200-400MB
   # Ensure system has enough free memory
   top -o MEM
   ```

3. **Restart Claude Desktop**:
   - Completely quit and restart

## Analysis Problems

### No issues detected in files with obvious problems

**Problem**: Analysis runs but returns 0 issues for a file with clear problems

**Possible causes and solutions**:

1. **Language not supported**:
   ```bash
   # Currently supported: .js, .jsx, .ts, .tsx, .py, .mjs, .cjs
   # Check file extension
   ```

2. **File not in recognized language**:
   ```bash
   # Run tests to verify plugins are working
   npm test

   # Should show tests passing for JavaScript and Python analysis
   ```

3. **SLOOP backend not started**:
   - Backend starts lazily on first analysis request
   - First analysis may take 5-10 seconds (normal)
   - Subsequent analyses are much faster

4. **File path issues**:
   ```bash
   # Ensure path is absolute, not relative
   # ❌ Wrong: "./src/file.js"
   # ✅ Correct: "/full/path/to/src/file.js"
   ```

### Analysis timeout or hangs

**Problem**: `analyze_file` never returns

**Solution**:

1. **Check file size**:
   ```bash
   # Very large files (>1MB) may take longer
   # First analysis takes 5-10 seconds (SLOOP startup)
   ```

2. **Check SLOOP process**:
   ```bash
   # Look for Java process
   ps aux | grep java
   # Should show: java -jar sonarlint-backend-cli.jar
   ```

3. **Kill and restart**:
   ```bash
   # Kill stuck SLOOP
   pkill -f "sonarlint-backend-cli.jar"

   # Restart MCP server
   # Next analysis will start fresh SLOOP
   ```

### "File not found" errors

**Problem**: `Error: File does not exist: /path/to/file`

**Solution**:
```bash
# Check file exists
ls -la /path/to/file

# Check permissions
# File must be readable
ls -l /path/to/file

# Use absolute path
realpath ./relative/path/file.js
```

## Performance Issues

### Analysis is very slow

**Problem**: Each analysis takes 10+ seconds

**Possible causes**:

1. **First analysis is always slow** (5-10 seconds):
   - SLOOP backend startup
   - Plugin loading
   - eslint-bridge initialization
   - **This is normal!** Subsequent analyses are fast.

2. **Subsequent analyses should be faster**:
   - Files are re-analyzed on each request
   - SLOOP maintains internal state for performance

3. **Large file**:
   ```bash
   # Check file size
   wc -l /path/to/file.js
   # Files >1000 lines may take longer
   ```

**Solutions**:

1. **Wait for first analysis to complete**:
   - First run: 5-10 seconds (backend startup)
   - Cached runs: <1 second

2. **Use batch analysis for multiple files**:
   ```
   Ask Claude: "Analyze these files: file1.js, file2.js, file3.js"
   # Uses analyze_files tool - more efficient
   ```

3. **Check system resources**:
   ```bash
   # SLOOP needs ~400MB memory
   # Check available memory
   free -h  # Linux
   top      # macOS
   ```

### Memory usage is high

**Problem**: MCP server using too much memory

**Normal memory usage**:
- MCP Server: ~50MB
- SLOOP Backend: ~200-400MB
- Total: ~450MB

**If much higher**:

1. **Check for memory leaks**:
   ```bash
   # Run tests multiple times
   npm test
   npm test

   # Memory should be stable
   ```

2. **Restart server**:
   - Restart Claude Desktop to fully clear server state

3. **Reduce concurrent analyses**:
   - Avoid analyzing 10+ files simultaneously

## Plugin Issues

### "Plugins directory not found"

**Problem**: `Error: Plugins directory does not exist`

**Solution**:
```bash
# Download plugins
npm run setup

# Verify directory structure
ls -la sonarlint-backend/
# Should show:
#   - sonarlint-backend-cli-*.jar
#   - jre/
#   - plugins/

ls -la sonarlint-backend/plugins/
# Should show:
#   - sonar-javascript-plugin-*.jar
#   - sonar-python-plugin-*.jar
#   - eslint-bridge/
```

### "Plugin failed to load"

**Problem**: Plugins not working or analysis fails

**Solution**:

1. **Verify JAR files exist**:
   ```bash
   # Check JAR files are present
   ls -la sonarlint-backend/plugins/*.jar
   # Should show:
   #   sonar-javascript-plugin-11.3.0.34350.jar
   #   sonar-python-plugin-5.9.0.23806.jar
   ```

2. **Re-download plugins**:
   ```bash
   rm -rf sonarlint-backend/
   npm run setup
   ```

3. **Run tests to verify plugins work**:
   ```bash
   npm test
   # Should pass tests for JavaScript and Python analysis
   ```

### eslint-bridge not found

**Problem**: JavaScript analysis fails with "eslint-bridge not found"

**Solution**:
```bash
# Check eslint-bridge directory
ls -la sonarlint-backend/plugins/eslint-bridge/package/

# Should contain:
#   - bin/server.cjs
#   - node_modules/
#   - package.json

# If missing, re-extract:
cd sonarlint-backend/plugins
unzip -q sonar-javascript-plugin-*.jar sonarjs-1.0.0.tgz
rm -rf eslint-bridge
mkdir eslint-bridge
tar -xzf sonarjs-1.0.0.tgz -C eslint-bridge
rm sonarjs-1.0.0.tgz
```

## Java/Node.js Issues

### "Java not found" or JRE errors

**Problem**: SLOOP can't start because Java is missing

**Solution**:

The bundled JRE should work automatically. If issues:

```bash
# Check bundled JRE
ls -la sonarlint-backend/jre/
# Should exist and contain bin/java

# Test Java
sonarlint-backend/jre/bin/java -version
# Should show: Java 17

# If JRE missing, re-download
rm -rf sonarlint-backend/
npm run setup
```

### "Node.js version not supported"

**Problem**: Server won't start due to old Node.js

**Solution**:
```bash
# Check version
node --version

# Must be v22.7.5 or higher
# If older, update Node.js:
# - Use nvm: nvm install 22
# - Or download from: https://nodejs.org
```

### Node.js path issues in analysis

**Problem**: JavaScript analysis fails with "Node.js not found"

**Solution**:

Check that SLOOP can find Node.js:

```bash
# Verify Node.js is in PATH
which node
# Should show: /usr/local/bin/node or similar

# Test Node.js works
node --version
# Should show: v22.7.5 or higher

# Check SLOOP configuration in src/sloop-bridge.ts
# Should have: clientNodeJsPath: process.execPath
```

## Debugging

### Enable verbose logging

1. **MCP Server logs**:
   ```typescript
   // In src/index.ts, uncomment debug logs
   console.error('[MCP] Debug: ...', data);
   ```

2. **SLOOP Backend logs**:
   ```bash
   # Check SLOOP stderr output
   # Logs show in Claude Desktop MCP logs
   ```

3. **Test scripts with verbose output**:
   ```bash
   # Run test with full output
   node test-mcp-server.js 2>&1 | tee test-output.log
   ```

### Inspect Claude Desktop logs

```bash
# macOS
tail -f ~/Library/Logs/Claude/mcp*.log

# Look for:
# - Connection errors
# - Server crashes
# - JSON parse errors
# - Tool execution failures
```

### Test MCP server directly

```bash
# Run test script
node test-health-check.js

# Run full analysis test
node test-mcp-server.js

# Test direct SLOOP
node test-direct-analysis.js
```

### Common error patterns

#### "Cannot parse JSON"

**Cause**: SLOOP output contains non-JSON (debug logs)

**Solution**: Filter stderr output in src/sloop-bridge.ts

#### "Request timeout"

**Cause**: SLOOP not responding

**Solution**:
```bash
# Kill stuck process
pkill -f "sonarlint-backend-cli.jar"
# Restart MCP server
```

#### "Port already in use"

**Cause**: Multiple SLOOP instances running

**Solution**:
```bash
# Find and kill all instances
ps aux | grep "sonarlint-backend"
kill <PID>
```

### Debugging workflow

1. **Run test suite**:
   ```bash
   npm test
   ```

2. **Check test output for specific failures**:
   ```bash
   npm test -- --reporter=verbose
   ```

3. **Test server starts**:
   ```bash
   node dist/index.js
   # Should start without errors
   # Press Ctrl+C to stop
   ```

4. **Check Claude logs**:
   ```bash
   tail -f ~/Library/Logs/Claude/mcp*.log
   ```

5. **Test specific file via Claude**:
   ```bash
   # Create test file
   echo "var x = 1;" > /tmp/test.js

   # Ask Claude: "Analyze /tmp/test.js for code quality issues"
   ```

## Getting Help

If issues persist:

1. **Check GitHub issues**: Look for similar problems
2. **Review documentation**:
   - [SETUP.md](./SETUP.md) - Installation steps
   - [README.md](./README.md) - Overview and features
   - [docs/](./docs/) - Technical documentation
3. **Collect debug information**:
   ```bash
   # System info
   node --version
   npm --version
   uname -a

   # Run tests
   npm test > debug-info.txt 2>&1

   # Check backend directory
   ls -la sonarlint-backend/ >> debug-info.txt 2>&1

   # Claude logs (last 50 lines)
   tail -50 ~/Library/Logs/Claude/mcp*.log >> debug-info.txt 2>&1
   ```
4. **Open an issue** with debug information

## Quick Reference

### Restart everything

```bash
# Kill all related processes
pkill -f "sonarlint-backend"
pkill -f "node dist/index.js"

# Quit Claude Desktop (Cmd+Q)

# Restart Claude Desktop

# Test
npm test
```

### Clean reinstall

```bash
# Remove everything
rm -rf node_modules dist sonarlint-backend package-lock.json

# Reinstall (will auto-download backend via postinstall)
npm install

# Build
npm run build

# Test
npm test
```

### Verify installation

```bash
# Check all components
echo "Node.js version:"
node --version

echo -e "\nDependencies installed:"
npm list --depth=0

echo -e "\nBuild artifacts:"
ls -la dist/

echo -e "\nBackend files:"
ls -la sonarlint-backend/

echo -e "\nPlugins:"
ls -la sonarlint-backend/plugins/

echo -e "\nRun tests:"
npm test
```

## Common Success Indicators

You know everything is working when:

- ✅ `npm test` passes all tests
- ✅ Backend directory exists with lib/, jre/, plugins/
- ✅ Claude can see SonarLint tools available
- ✅ Analysis returns issues for test files
- ✅ Response times are fast after first analysis (<1 second)
- ✅ Health check shows "healthy" status

## Still Having Issues?

Contact support or open an issue with:
- Output of `npm test`
- Output of `ls -la sonarlint-backend/`
- Claude Desktop logs (last 50 lines)
- Your `claude_desktop_config.json` (redact sensitive info)
- System info: `node --version`, `npm --version`, OS version
