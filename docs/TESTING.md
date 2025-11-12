# Testing Strategy

This document outlines the testing approach for the SonarLint MCP Server.

## Why Vitest?

We chose **Vitest** over Jest for the following reasons:

1. **Native ESM Support** - Works seamlessly with `"type": "module"` in package.json
2. **Faster** - Uses Vite's transformation pipeline for quick test execution
3. **Better TypeScript Support** - No configuration gymnastics required
4. **Compatible API** - Almost identical to Jest (easy migration)
5. **Watch Mode** - Lightning-fast reruns during development
6. **Built-in Coverage** - V8 coverage out of the box

## Test Structure

```
tests/
├── unit/                           # Unit tests (fast, isolated)
│   ├── language-helpers.test.ts   # Language detection and enum mapping
│   ├── client-file-dto.test.ts    # ClientFileDto construction logic
│   └── apply-all-quick-fixes.test.ts # Quick fix application logic
├── integration/                    # Integration tests (documentation)
│   └── cache-invalidation.test.ts # Cache invalidation requirements
├── e2e/                            # End-to-end tests (real MCP server)
│   └── apply-all-quick-fixes.e2e.test.ts # Full MCP workflow
├── helpers/                        # Test utilities
│   └── e2e-setup.ts                # MCP test client helper
└── fixtures/                       # Test fixture files
    └── sample.js                   # Sample file with known SonarLint issues
```

## Test Categories

### Unit Tests ⚡ Fast, Isolated

**Purpose**: Test individual functions without external dependencies

**Coverage**:
- `languageToEnum()` - Maps language names to SLOOP enum values
- `detectLanguage()` - Detects language from file extensions
- ClientFileDto construction - Validates DTO structure
- Edge case handling - Empty strings, unknown languages, etc.

**Characteristics**:
- No SLOOP backend required
- Milliseconds per test
- Run automatically in CI/CD
- High coverage (>90% goal)

**Run Command**:
```bash
npm test -- tests/unit
```

### Integration Tests 📚 Documentation

**Purpose**: Document critical implementation requirements

**Coverage**:
- Cache invalidation requirements
- ClientFileDto structure requirements
- SLOOP internal behavior findings
- Reverse engineering discoveries

**Characteristics**:
- No external dependencies
- Milliseconds per test
- Run automatically in CI/CD
- Serve as living documentation

**Run Command**:
```bash
npm test -- tests/integration
```

**Note**: One test is marked as `.skip` - it's a manual integration test that documents the verified cache invalidation flow requiring a running MCP server.

### E2E Tests 🔄 Real MCP Server

**Purpose**: Verify complete MCP workflow with real SLOOP backend

**Coverage**:
- Full MCP server startup and shutdown
- MCP client/server communication
- Real SLOOP analysis
- Quick fix application
- Cache invalidation in practice
- Error handling

**Characteristics**:
- Requires SLOOP backend (downloads automatically)
- Seconds per test (spawns real processes)
- Run in local development
- Skipped in CI (use `test:unit` + `test:integration` instead)

**Run Command**:
```bash
npm run test:e2e
```

**Test Coverage**:
- Server health check
- File analysis with real issues
- Apply all quick fixes
- File modification verification
- Re-analysis after fixes
- Non-fixable issues handling
- Non-existent file errors
- Tool listing

## Running Tests

### All Tests (Watch Mode)
```bash
npm test
```

### Run Once (CI Mode)
```bash
npm run test:run
```

### Interactive UI
```bash
npm run test:ui
```

### Coverage Report
```bash
npm run test:coverage
```

### Specific Test File
```bash
npm test -- tests/unit/language-helpers.test.ts
```

## Test Results

Current test suite:
- **94 tests passing** ✅
- **1 test skipped** (manual integration test)
- **Duration**: ~7s (including E2E with real SLOOP)

### Unit Test Results (81 tests)

#### `language-helpers.test.ts` (37 tests)
- ✅ Language enum mapping (10 languages)
- ✅ Unknown language handling (3 edge cases)
- ✅ File extension detection (13 languages)
- ✅ Edge cases (7 scenarios)
- ✅ Combined pipeline (4 scenarios)

#### `client-file-dto.test.ts` (27 tests)
- ✅ URI format validation
- ✅ Relative path calculation
- ✅ CRITICAL: `isUserDefined` field (must be true)
- ✅ CRITICAL: `content` field (triggers isDirty)
- ✅ CRITICAL: `fsPath` field (provides context)
- ✅ Language enum validation
- ✅ Complete DTO structure

#### `apply-all-quick-fixes.test.ts` (17 tests)
- ✅ Issue filtering (fixable vs non-fixable)
- ✅ Issue sorting (descending by line number)
- ✅ Text edit application
- ✅ Summary generation
- ✅ Error handling
- ✅ Edge cases (no issues, encoding, etc.)
- ✅ Performance considerations

### Integration Test Results (5 tests + 1 skipped)

#### `cache-invalidation.test.ts`
- ⏭️ Manual E2E flow (skipped - for documentation)
- ✅ Documents critical requirements
- ✅ Documents what doesn't work
- ✅ Documents ClientFileDto structure
- ✅ Documents SLOOP internal behavior
- ✅ Documents reverse engineering findings

### E2E Test Results (8 tests)

#### `apply-all-quick-fixes.e2e.test.ts`
- ✅ Server health check
- ✅ File analysis with real SLOOP
- ✅ Apply all quick fixes (batch)
- ✅ File modification verification
- ✅ Re-analysis shows fewer issues
- ✅ Handle files with no fixable issues
- ✅ Handle non-existent files
- ✅ List available tools

## What We Test

### ✅ Covered by Tests

1. **Language Detection**
   - All supported file extensions (.js, .ts, .py, etc.)
   - Edge cases (no extension, uppercase, multiple dots)
   - Path handling (absolute, relative, Windows)

2. **Language Enum Mapping**
   - All supported languages (JavaScript → JS, TypeScript → TS, etc.)
   - Unknown language handling
   - Case sensitivity

3. **ClientFileDto Structure**
   - URI format (`file://` prefix)
   - Relative path calculation
   - All required fields present
   - CRITICAL fields (isUserDefined, content, fsPath)

4. **Cache Invalidation Requirements**
   - Documented in integration test
   - Verified through manual testing
   - Based on reverse engineering findings

### ✅ Covered by E2E Tests

1. **Live SLOOP Integration**
   - ✅ Actual RPC communication
   - ✅ Real-time cache invalidation
   - ✅ File system notifications

2. **MCP Protocol**
   - ✅ Tool invocation
   - ✅ Request/response handling
   - ✅ Error scenarios

3. **SLOOP Bridge**
   - ✅ Process spawning
   - ✅ Message parsing
   - ✅ Client callbacks

### ❌ Not Covered (Future Work)

1. **Additional MCP Tools**
   - analyze_files (batch)
   - analyze_content (snippets)
   - analyze_project (directory)
   - apply_quick_fix (single)
   - list_active_rules

2. **Performance Tests**
   - Large file analysis
   - Concurrent requests
   - Memory usage

3. **Error Recovery**
   - SLOOP crashes
   - Corrupted files
   - Network timeouts

## Critical Test Cases

### Why These Tests Matter

The test suite emphasizes **critical fields** discovered through reverse engineering:

#### 1. `isUserDefined: true` (CRITICAL!)
```typescript
// ❌ WRONG - SLOOP returns 0 issues
const dto = { isUserDefined: false };

// ✅ CORRECT - SLOOP analyzes the file
const dto = { isUserDefined: true };
```

#### 2. `content: string` (CRITICAL!)
```typescript
// ❌ WRONG - SLOOP reads stale file from disk
const dto = { content: null };

// ✅ CORRECT - Triggers isDirty=true, uses provided content
const dto = { content: readFileSync(filePath, 'utf-8') };
```

#### 3. `fsPath: string` (CRITICAL!)
```typescript
// ❌ WRONG - Analyzers may fail
const dto = { fsPath: null };

// ✅ CORRECT - Provides context for analyzers
const dto = { fsPath: '/absolute/path/to/file.js' };
```

#### 4. `detectedLanguage: "JS"` (CRITICAL!)
```typescript
// ❌ WRONG - Lowercase doesn't match SLOOP enum
const dto = { detectedLanguage: 'javascript' };

// ✅ CORRECT - Uppercase enum value
const dto = { detectedLanguage: 'JS' };
```

## CI/CD Integration

Tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run tests
  run: npm run test:run

- name: Generate coverage
  run: npm run test:coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

## Coverage Goals

- **Unit Tests**: >90% coverage for helper functions
- **Integration Tests**: Verify critical user flows

Current coverage (estimated):
- Language helpers: ~95%
- ClientFileDto logic: ~90%
- SLOOP integration: Documented (not automated)

## Future Enhancements

1. **Add SLOOP Mock**
   - Simulate SLOOP responses
   - Test error handling
   - Speed up integration tests

2. **Add MCP Protocol Tests**
   - Tool invocation
   - Request/response validation
   - Error scenarios

3. **Add Performance Tests**
   - Benchmark analysis speed
   - Memory usage
   - Concurrency handling

4. **Add Snapshot Tests**
   - Issue formatting
   - Error messages
   - RPC payloads

## Writing New Tests

### Unit Test Template

```typescript
import { describe, it, expect } from 'vitest';

describe('MyFunction', () => {
  it('should handle happy path', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });

  it('should handle edge case', () => {
    const result = myFunction('');
    expect(result).toBe('fallback');
  });
});
```

### Integration Test Template

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('MyIntegration', () => {
  beforeAll(async () => {
    // Setup (start SLOOP, create files, etc.)
  });

  afterAll(async () => {
    // Cleanup
  });

  it.skip('should do end-to-end flow', async () => {
    // Test implementation
    // Use .skip if requires external dependencies
  });
});
```

## Debugging Tests

### Run Single Test
```bash
npm test -- -t "should map javascript to JS"
```

### Watch Specific File
```bash
npm test -- tests/unit/language-helpers.test.ts
```

### Debug in VS Code
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest Tests",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["test"],
  "console": "integratedTerminal"
}
```

## References

- [Vitest Documentation](https://vitest.dev/)
- [SLOOP RPC Protocol](./SLOOP_RPC_PROTOCOL.md)
