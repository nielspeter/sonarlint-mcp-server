# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.5.3](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.5.2...v0.5.3) (2026-04-03)


### Bug Fixes

* prefer .git over package.json in findProjectRoot ([a421881](https://github.com/nielspeter/sonarlint-mcp-server/commit/a4218819a50d8d3109fe636487987f79f4f4d7b6))

### [0.5.2](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.5.1...v0.5.2) (2026-04-03)


### Bug Fixes

* apply sonarlint.json config via SLOOP notification ([3b25c28](https://github.com/nielspeter/sonarlint-mcp-server/commit/3b25c2853b456b3cc6b7398408dd5990c6ac22ff))
* reduce list_rules complexity and remove unnecessary assertions ([be538df](https://github.com/nielspeter/sonarlint-mcp-server/commit/be538df1cf13d557d2fc8a93dc8b0958660746e5))

### [0.5.1](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.5.0...v0.5.1) (2026-04-02)


### Bug Fixes

* add .gitattributes to enforce LF on checkout ([19c3497](https://github.com/nielspeter/sonarlint-mcp-server/commit/19c3497b264dccd6de98ce6326373df6952b12f7))
* map language names to SLOOP codes in list_rules filter ([50af547](https://github.com/nielspeter/sonarlint-mcp-server/commit/50af547aa3955334fc537faa50d5cb751f49ced8))
* set Prettier endOfLine to lf for Windows CI compatibility ([1882dc2](https://github.com/nielspeter/sonarlint-mcp-server/commit/1882dc2e27dbab5f2581c7f63ee399b626cdc372))
* skip integration tests on Windows ([e2b6360](https://github.com/nielspeter/sonarlint-mcp-server/commit/e2b6360273c5637cf4edea6ecdc4bea141e27354))
* update CI to Node 22/24 and add lint/format checks ([c90883d](https://github.com/nielspeter/sonarlint-mcp-server/commit/c90883d03e02cda093826074f995a87f78d3d8d4))
* use path.join in config tests for Windows compatibility ([2a2748a](https://github.com/nielspeter/sonarlint-mcp-server/commit/2a2748ab4b86a768dd74f2557032ca33b8b8f26a))

## [0.5.0](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.4.1...v0.5.0) (2026-04-02)


### Features

* add sonarlint.json config file support and ESLint/Prettier setup ([140a885](https://github.com/nielspeter/sonarlint-mcp-server/commit/140a8857e8305c880b82a07f35b93fbd90d46f97))

### [0.4.1](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.4.0...v0.4.1) (2026-03-30)


### Features

* add basePath parameter for relative paths and globs in check_files ([3fbc1ff](https://github.com/nielspeter/sonarlint-mcp-server/commit/3fbc1ff2737c12b174818bc9ba31cd38c79ba695))


### Bug Fixes

* resolve 15 sonarlint issues across codebase ([be91de6](https://github.com/nielspeter/sonarlint-mcp-server/commit/be91de6d3da6b7c38e2a7720e5285f57137f3d81))


### Code Refactoring

* reduce cognitive complexity to zero sonarlint issues ([213aad6](https://github.com/nielspeter/sonarlint-mcp-server/commit/213aad634427b302c31d23ab2f9dbaa7ebe1f138))

## [0.4.0](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.3.1...v0.4.0) (2026-03-30)


### Bug Fixes

* resolve SLOOP analysis hang by pre-registering files before scope creation ([ee1bfb2](https://github.com/nielspeter/sonarlint-mcp-server/commit/ee1bfb24be94b72838fc1fb4e4ff17ba297a9d19))

### [0.3.1](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.3.0...v0.3.1) (2026-03-30)


### Bug Fixes

* use project root for scope detection instead of parent directory ([cd1591f](https://github.com/nielspeter/sonarlint-mcp-server/commit/cd1591fff30dea271ce927e6687860043c31566f))

## [0.3.0](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.2.8...v0.3.0) (2026-03-30)


### Code Refactoring

* rename tools for clarity and improve descriptions ([c601bcb](https://github.com/nielspeter/sonarlint-mcp-server/commit/c601bcbc7ff0272f433277bdc1e2f8801737d2d5))

### [0.2.8](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.2.7...v0.2.8) (2026-03-30)


### Bug Fixes

* improve tool descriptions and accept string arrays ([e113cd8](https://github.com/nielspeter/sonarlint-mcp-server/commit/e113cd8d559a07e3982b050b6302923e3ab581e7))

### [0.2.7](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.2.6...v0.2.7) (2026-03-30)


### Bug Fixes

* increase analysis timeout from 60s to 180s ([e358de4](https://github.com/nielspeter/sonarlint-mcp-server/commit/e358de4d5d8aee00bcbc5a7d611a5f72615fa24e))

### [0.2.6](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.2.5...v0.2.6) (2026-03-28)


### Bug Fixes

* compact batch output and real rule catalog from SLOOP ([65ed048](https://github.com/nielspeter/sonarlint-mcp-server/commit/65ed048f4d30a6c28af98da4013c90c8c2b94110)), closes [#6](https://github.com/nielspeter/sonarlint-mcp-server/issues/6) [#7](https://github.com/nielspeter/sonarlint-mcp-server/issues/7) [#6](https://github.com/nielspeter/sonarlint-mcp-server/issues/6) [#7](https://github.com/nielspeter/sonarlint-mcp-server/issues/7)

### [0.2.5](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.2.4...v0.2.5) (2026-03-28)


### Bug Fixes

* register files in SLOOP VFS before analysis ([ca0391a](https://github.com/nielspeter/sonarlint-mcp-server/commit/ca0391a9f59a9e14a0f5f7bc7757b16bc7f87be4)), closes [#5](https://github.com/nielspeter/sonarlint-mcp-server/issues/5)

### [0.2.4](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.2.3...v0.2.4) (2026-03-28)


### Bug Fixes

* handle raiseIssues notifications from SLOOP backend ([8d01eb4](https://github.com/nielspeter/sonarlint-mcp-server/commit/8d01eb4df2eb5edca019849c0562e479575c4f00)), closes [#4](https://github.com/nielspeter/sonarlint-mcp-server/issues/4)

### [0.2.3](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.2.2...v0.2.3) (2026-03-28)


### Bug Fixes

* health check reports correct version and backend status ([2dee842](https://github.com/nielspeter/sonarlint-mcp-server/commit/2dee842322d9e7c05c152491a457b70fd6465fe3)), closes [#2](https://github.com/nielspeter/sonarlint-mcp-server/issues/2)

### [0.2.2](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.2.1...v0.2.2) (2026-03-28)


### Features

* add robust extraction and validation to setup script ([efb737e](https://github.com/nielspeter/sonarlint-mcp-server/commit/efb737e4bc9bb5a74c24a5dafe7df46f05e395d9))


### Bug Fixes

* add bin entry matching package name for npx compatibility ([e4f4220](https://github.com/nielspeter/sonarlint-mcp-server/commit/e4f422029af47cdef3546a94bfc8734b6db7db7a))
* correct tarball extraction and update Python plugin version ([c1cbe3a](https://github.com/nielspeter/sonarlint-mcp-server/commit/c1cbe3acaf05e04827c4da2ac28b51ff09357ce0))


### Documentation

* Clarify Claude Code vs Claude Desktop configuration and remove unnecessary global install option ([394f943](https://github.com/nielspeter/sonarlint-mcp-server/commit/394f9439eca6388f11034782d17b93d296802ea2))

### [0.2.1](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.2.0...v0.2.1) (2025-11-12)


### Bug Fixes

* skip E2E tests in publish workflow (require SLOOP backend) ([0b738f5](https://github.com/nielspeter/sonarlint-mcp-server/commit/0b738f5155a4fa5de4517f04fb3e371c917da3b2))

## [0.2.0](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.1.3...v0.2.0) (2025-11-12)


### Code Refactoring

* Modularize codebase - split large index.ts into focused modules ([c85ff94](https://github.com/nielspeter/sonarlint-mcp-server/commit/c85ff94cd334943b31a5118aad5a7a44fc35f20d))


### Documentation

* add CLAUDE.md development guide ([51dfcfc](https://github.com/nielspeter/sonarlint-mcp-server/commit/51dfcfcec1a710ab3279da452ff1854fa4df0a97))
* Fix outdated information in SETUP.md and TROUBLESHOOTING.md ([f34274a](https://github.com/nielspeter/sonarlint-mcp-server/commit/f34274aab37ce1dbefa4889e1c28f75ab7cc1de0))
* Remove redundant SLOOP-RPC-INTERNALS.md ([fd25915](https://github.com/nielspeter/sonarlint-mcp-server/commit/fd259150b3aa0e8c3f4e1b477c5de104330b20e4))
* Update TESTING.md to reflect current test structure ([d22e4a2](https://github.com/nielspeter/sonarlint-mcp-server/commit/d22e4a2fa3d34980692c5ee04bfb4250eef48f02))

### [0.1.3](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.1.2...v0.1.3) (2025-11-11)


### Features

* add apply_all_quick_fixes tool for batch fixing ([e81beaf](https://github.com/nielspeter/sonarlint-mcp-server/commit/e81beafb9bc12e82df805c4166c66024e890b473))


### Documentation

* clarify that apply_quick_fix fixes one issue at a time ([224f216](https://github.com/nielspeter/sonarlint-mcp-server/commit/224f216755f16e9bb47781d33626ea7d828e61f5))

### [0.1.2](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.1.1...v0.1.2) (2025-11-11)


### Bug Fixes

* remove false claim about 5-minute TTL caching ([d31ba0a](https://github.com/nielspeter/sonarlint-mcp-server/commit/d31ba0acd2ee201176187c0a028bb570ee30314f))
* remove flaky backend verification step from CI ([381dee2](https://github.com/nielspeter/sonarlint-mcp-server/commit/381dee287c0f144b1eeb1f761e6c797b4f42a8ed))
* remove remaining false caching claims from README ([a4beb30](https://github.com/nielspeter/sonarlint-mcp-server/commit/a4beb30046286efb5fcc0ed47197ffa5304abd7d))
* require Node.js 20+ (vitest 4.x requirement) ([2c2e865](https://github.com/nielspeter/sonarlint-mcp-server/commit/2c2e865b1b122f7f27625e02502fc91f280603a4))
* update error message for missing backend (remove obsolete script reference) ([96447cb](https://github.com/nielspeter/sonarlint-mcp-server/commit/96447cb0e7f3cbf57430047d5794b53d94b59eca))
* use package root instead of cwd for backend location ([5156db7](https://github.com/nielspeter/sonarlint-mcp-server/commit/5156db759fa82a06a1def964d083d6d29f0a8925))

### [0.1.1](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.1.0...v0.1.1) (2025-11-11)


### Features

* enable OIDC trusted publishing (token-free CI/CD) ([e9ec8cd](https://github.com/nielspeter/sonarlint-mcp-server/commit/e9ec8cd8699618f80a6a7eaa931d4594e2b7f9da))
* switch to OIDC trusted publishing (no tokens needed) ([5dc5aab](https://github.com/nielspeter/sonarlint-mcp-server/commit/5dc5aabefcb9f8345e526b5ca36b336b8273dd88))

## [0.1.0] - 2025-01-11

### Added
- Initial release of SonarLint MCP Server
- Full MCP protocol implementation with 5 tools:
  - `analyze_file`: Analyze single files for code quality issues
  - `analyze_files`: Batch analyze multiple files
  - `analyze_content`: Analyze code snippets without saving to disk
  - `list_active_rules`: Show all active SonarLint rules by language
  - `health_check`: Server status and diagnostics
- SLOOP backend integration (version 10.32.0.82302)
- JavaScript/TypeScript analysis with 265 active rules
- Python analysis with ~100 active rules
- Bi-directional JSON-RPC communication with SLOOP
- Quick fixes and automated code suggestions
- Analysis caching with 5-minute TTL
- MCP resources for persistent analysis results
- Comprehensive test suite with Vitest
- GitHub Actions CI/CD workflows
- Automatic SLOOP backend download via postinstall script
- Platform-specific support: macOS (ARM64/x64), Linux (ARM64/x64), Windows (x64)
- Complete documentation (README, SETUP, TROUBLESHOOTING)

### Technical Details
- Standalone SLOOP operation (no IDE required)
- Bundled JRE (Java 17)
- File modification tracking for cache invalidation
- Session storage for multi-turn conversations
- Health monitoring and diagnostics
- Comprehensive error handling

[Unreleased]: https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nielspeter/sonarlint-mcp-server/releases/tag/v0.1.0
