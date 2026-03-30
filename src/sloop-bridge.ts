import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { tmpdir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { IssueCollector } from './utils/issue-collector.js';
import { buildClientFileDtos } from './utils/file-registration.js';
import { scopeToProjectRoot, scopeFiles } from './state.js';

interface SloopConfig {
  javaPath?: string;
  sloopLibPath?: string;
  storageRoot?: string;
  workDir?: string;
  autoInitialize?: boolean;
}

export class SloopBridge extends EventEmitter {
  private process: ChildProcess | null = null;
  private connected = false;
  private messageId = 0;
  private readonly pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: NodeJS.Timeout;
  }>();
  private messageBuffer = '';
  private readonly config: Required<Omit<SloopConfig, 'autoInitialize'>> & Pick<SloopConfig, 'autoInitialize'>;
  private readonly projectRoot: string;
  private readonly issueCollector = new IssueCollector();

  constructor(packageRoot?: string, config: SloopConfig = {}) {
    super();

    // Use provided package root or fall back to process.cwd()
    this.projectRoot = packageRoot || process.cwd();

    // Default configuration - using local sonarlint-intellij directory
    const cacheDir = join(tmpdir(), 'sonarlint-mcp');
    this.config = {
      javaPath: config.javaPath || this.findJavaPath(),
      sloopLibPath: config.sloopLibPath || this.findSloopLibPath(),
      storageRoot: config.storageRoot || join(cacheDir, 'storage'),
      workDir: config.workDir || join(cacheDir, 'work'),
      autoInitialize: config.autoInitialize,
    };

    // Ensure directories exist
    [this.config.storageRoot, this.config.workDir].forEach(dir => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });
  }

  private findJavaPath(): string {
    // Use embedded JRE from Maven Central distribution
    const embeddedJava = join(this.projectRoot, 'sonarlint-backend/jre/bin/java');
    if (existsSync(embeddedJava)) {
      return embeddedJava;
    }
    // Fall back to system java
    return 'java';
  }

  private findSloopLibPath(): string {
    const path = join(this.projectRoot, 'sonarlint-backend/lib');
    if (!existsSync(path)) {
      throw new Error(
        `SLOOP library not found at ${path}. Run './download-plugins.sh' to download Maven Central artifacts.`
      );
    }
    return path;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      try {
        console.error('Starting SLOOP backend...');

        // Use exact JVM parameters that WebStorm uses
        // Get the directory containing Node.js to prepend to PATH
        const nodeDir = process.execPath.substring(0, process.execPath.lastIndexOf('/'));
        const currentPath = process.env.PATH || '';

        this.process = spawn(this.config.javaPath, [
          '-Xms384m',
          // Note: WebStorm doesn't use -Xmx, omitting it
          '-XX:+UseG1GC',
          '-XX:MaxHeapFreeRatio=20',
          '-XX:MinHeapFreeRatio=10',
          '-XX:+UseStringDeduplication',
          '-XX:MaxGCPauseMillis=50',
          '-XX:ParallelGCThreads=2',
          '-Djava.awt.headless=true',
          '-classpath',
          `${this.config.sloopLibPath}/*`,
          'org.sonarsource.sonarlint.core.backend.cli.SonarLintServerCli'
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PATH: `${nodeDir}:${currentPath}`  // Prepend Node directory to PATH
          }
        });

        this.process.on('error', (error) => {
          reject(error);
        });

        this.process.on('close', (code) => {
          console.error(`SLOOP exited with code ${code}`);
          this.connected = false;
          this.emit('disconnected');
          this.rejectAllPending('SLOOP process closed');
        });

        this.setupMessageHandlers();

        // Mark as connected immediately so we can send the initialize request
        // The SLOOP backend is ready to receive JSON-RPC as soon as the process starts
        this.connected = true;

        if (this.config.autoInitialize !== false) {
          console.error('Sending initialize request...');
          this.initialize()
            .then(() => {
              console.error('SLOOP initialized successfully');
              resolve();
            })
            .catch((err) => {
              console.error('SLOOP initialization failed:', err);
              this.connected = false;
              reject(err);
            });
        } else {
          resolve();
        }

      } catch (error) {
        reject(error);
      }
    });
  }

  private setupMessageHandlers(): void {
    if (!this.process?.stdout) return;

    this.process.stdout.on('data', (data: Buffer) => {
      this.messageBuffer += data.toString();
      this.processMessages();
    });

    this.process.stderr!.on('data', (data: Buffer) => {
      const msg = data.toString();
      if (!msg.includes('SLF4J')) { // Filter out common logging noise
        console.error('SLOOP stderr:', msg);
      }
    });
  }

  private processMessages(): void {
    while (true) {
      // Look for Content-Length header
      const headerMatch = /Content-Length: (\d+)\r?\n\r?\n/.exec(this.messageBuffer);
      if (!headerMatch) break;

      const contentLength = parseInt(headerMatch[1]);
      const headerEnd = headerMatch.index + headerMatch[0].length;
      const messageEnd = headerEnd + contentLength;

      if (this.messageBuffer.length < messageEnd) break; // Not enough data yet

      const messageJson = this.messageBuffer.substring(headerEnd, messageEnd);
      this.messageBuffer = this.messageBuffer.substring(messageEnd);

      try {
        const message = JSON.parse(messageJson);
        this.handleMessage(message);
      } catch (err) {
        console.error('Failed to parse message:', err, 'JSON:', messageJson.substring(0, 200));
      }
    }
  }

  private handleMessage(message: any): void {
    // Debug: log ALL messages for analysis-related responses
    if (message.id || (message.method && !message.method.includes('log'))) {
      const timestamp = new Date().toISOString();
      console.error(`[DEBUG ${timestamp}] Received message:`, JSON.stringify(message, null, 2).substring(0, 1000));
    }

    // Handle requests FROM SLOOP (client RPC methods) - check method field FIRST
    // Requests have both id AND method, responses have id but no method
    if (message.id && message.method) {
      this.handleClientRequest(message);
      return;
    }

    // Handle responses to our requests (has id but no method)
    if (message.id && !message.method) {
      if (this.pendingRequests.has(message.id)) {
        const pending = this.pendingRequests.get(message.id)!;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);

        if (message.error) {
          // Log full error for debugging
          console.error('Full RPC Error:', JSON.stringify(message.error, null, 2).substring(0, 2000));
          pending.reject(new Error(message.error.message || 'RPC Error'));
        } else {
          console.error('[DEBUG] Resolving request', message.id, 'with result');
          pending.resolve(message.result);
        }
      }
      return;
    }

    // Handle notifications from SLOOP (no id, has method)
    if (!message.id && message.method) {
      this.emit('notification', message);

      if (message.method === 'log') {
        this.emit('log', message.params);
      } else if (message.method === 'raiseIssues' && message.params) {
        const { analysisId, issuesByFileUri } = message.params;
        if (analysisId && issuesByFileUri) {
          this.issueCollector.addIssues(analysisId, issuesByFileUri);
          const count = Object.values(issuesByFileUri).reduce((sum: number, arr: any) => sum + arr.length, 0);
          console.error(`[SLOOP] Received raiseIssues: ${count} issues for analysis ${analysisId}`);
        }
      } else if (message.method === 'raiseHotspots' && message.params) {
        const { analysisId, hotspotsByFileUri } = message.params;
        if (analysisId && hotspotsByFileUri) {
          this.issueCollector.addHotspots(analysisId, hotspotsByFileUri);
          const count = Object.values(hotspotsByFileUri).reduce((sum: number, arr: any) => sum + arr.length, 0);
          console.error(`[SLOOP] Received raiseHotspots: ${count} hotspots for analysis ${analysisId}`);
        }
      } else if (message.method === 'didChangeAnalysisReadiness' && message.params) {
        const { configurationScopeIds, areReadyForAnalysis } = message.params;
        console.error(`[SLOOP] Analysis readiness changed: scopes=${configurationScopeIds}, ready=${areReadyForAnalysis}`);
        if (areReadyForAnalysis) {
          for (const scopeId of configurationScopeIds) {
            this.emit('scopeReady', scopeId);
          }
        }
      }
    }
  }

  private handleClientRequest(request: any): void {
    console.error(`[DEBUG] Handling client request: ${request.method}`);

    // listFiles — return only the files pre-registered in scopeFiles.
    // IMPORTANT: Do NOT scan the project directory here. SLOOP calls listFiles
    // during addConfigurationScope, so only the files the caller asked to analyse
    // should be returned. Scanning caused 500+ file responses and hangs on real
    // projects. Files are pre-registered in getOrCreateScope() before the scope
    // is created. See scope.ts for the full sequencing explanation.
    if (request.method === 'listFiles') {
      const configScopeId = request.params?.configScopeId;
      const fileDtos = scopeFiles.get(configScopeId) || [];
      console.error(`[DEBUG] listFiles for scope ${configScopeId}: returning ${fileDtos.length} registered files`);
      this.sendResponse(request.id, { files: fileDtos });
      return;
    }

    // Implement getBaseDir - SLOOP needs the base directory for the config scope
    if (request.method === 'getBaseDir') {
      const configScopeId = request.params?.configurationScopeId ?? request.params?.configScopeId;
      const projectRoot = scopeToProjectRoot.get(configScopeId) || process.cwd();
      console.error(`[DEBUG] getBaseDir for scope ${configScopeId}: ${projectRoot}`);
      this.sendResponse(request.id, { path: projectRoot });
      return;
    }

    // Implement getFileExclusions - file patterns to exclude from analysis
    if (request.method === 'getFileExclusions') {
      // Return standard exclusions (node_modules, .git, etc.)
      this.sendResponse(request.id, {
        fileExclusionPatterns: [
          'node_modules/**',
          '.git/**',
          'dist/**',
          'build/**',
          '**/*.min.js'
        ]
      });
      return;
    }

    // Implement getInferredAnalysisProperties - analysis configuration
    if (request.method === 'getInferredAnalysisProperties') {
      // Return empty properties - use defaults
      this.sendResponse(request.id, { properties: {} });
      return;
    }

    // Default: return empty result for unknown methods
    console.error(`[WARN] Unhandled client request: ${request.method}`);
    this.sendResponse(request.id, {});
  }

  private sendResponse(id: string, result: any): void {
    if (!this.connected || !this.process) return;

    const message = {
      jsonrpc: '2.0',
      id,
      result
    };

    const json = JSON.stringify(message);
    const content = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;

    console.error(`[DEBUG] Sending response to ${id}:`, JSON.stringify(result).substring(0, 200));
    this.process!.stdin!.write(content);
  }

  async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.connected || !this.process) {
      throw new Error('Not connected to SLOOP');
    }

    const id = String(++this.messageId);
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    // Debug logging for analysis calls
    const timestamp = new Date().toISOString();
    if (method.includes('analyze')) {
      console.error(`[DEBUG ${timestamp}] Sending ${method}:`, JSON.stringify(params, null, 2).substring(0, 500));
    } else {
      console.error(`[DEBUG ${timestamp}] Sending request: ${method} (ID: ${id})`);
    }

    // Dynamic timeout based on operation type
    // Analysis needs longer: first run starts eslint-bridge subprocess + parses full project
    const timeoutMs = method.includes('analyze') ? 600000 : 30000; // 10min for analysis, 30s for others

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        console.error(`[DEBUG] Request ${id} timed out after ${timeoutMs/1000}s: ${method}`);
        reject(new Error(`Request timeout after ${timeoutMs/1000}s: ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const json = JSON.stringify(message);
      const content = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;

      this.process!.stdin!.write(content);
    });
  }

  sendNotification(method: string, params?: any): void {
    if (!this.connected || !this.process) {
      throw new Error('Not connected to SLOOP');
    }

    const message = {
      jsonrpc: '2.0',
      method,
      params
    };

    const json = JSON.stringify(message);
    const content = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;

    // Debug logging for file system notifications
    if (method.includes('file') || method.includes('File')) {
      console.error(`[SLOOP RPC OUT] ${method}`);
      console.error(`[SLOOP RPC OUT] Params: ${JSON.stringify(params, null, 2)}`);
    }

    this.process!.stdin!.write(content);
  }

  private getPluginPaths(): string[] {
    const pluginDir = join(this.projectRoot, 'sonarlint-backend/plugins');

    if (!existsSync(pluginDir)) {
      console.error('Warning: Plugin directory not found. Run ./download-plugins.sh');
      return [];
    }

    const files = readdirSync(pluginDir);

    return files
      .filter((f: string) => f.endsWith('.jar'))
      .map((f: string) => join(pluginDir, f));
  }

  private async initialize(): Promise<void> {
    const pluginDir = join(this.projectRoot, 'sonarlint-backend/plugins');

    // Get all plugin JARs
    const pluginPaths: string[] = this.getPluginPaths();
    console.error(`Initializing SLOOP with ${pluginPaths.length} plugins from Maven Central`);

    // Find node executable - use the one running this process
    const nodePath = process.execPath;  // This will be the Node.js binary running the current process
    console.error(`Using Node.js: ${nodePath}`);

    const params = {
      clientConstantInfo: {
        name: 'SonarLint MCP Server',
        userAgent: 'sonarlint-mcp/1.0'
      },
      telemetryConstantAttributes: {
        productKey: 'mcp',
        productName: 'SonarLint MCP Server',
        productVersion: '1.0.0',
        ideVersion: '1.0.0',
        additionalAttributes: {}
      },
      httpConfiguration: {
        sslConfiguration: {
          trustStorePath: null,
          trustStorePassword: null,
          trustStoreType: null,
          keyStorePath: null,
          keyStorePassword: null,
          keyStoreType: null
        },
        connectTimeout: 'PT30S',
        socketTimeout: 'PT1M',
        connectionRequestTimeout: 'PT30S',
        responseTimeout: 'PT1M'
      },
      alternativeSonarCloudEnvironment: null,
      backendCapabilities: ['DATAFLOW_BUG_DETECTION', 'SECURITY_HOTSPOTS'],
      featureFlags: {
        shouldManageSmartNotifications: false,
        shouldManageServerSentEvents: false,
        shouldSynchronizeProjects: false,
        shouldManageLocalServer: true,
        isEnablesSecurityHotspots: true,
        isEnabledDataflowBugDetection: true,
        shouldManageFullSynchronization: false,
        isEnabledTelemetry: false,
        isEnabledMonitoring: false
      },
      storageRoot: this.config.storageRoot,
      workDir: this.config.workDir,
      embeddedPluginPaths: pluginPaths,
      connectedModeEmbeddedPluginPathsByKey: {},
      enabledLanguagesInStandaloneMode: ['JS', 'TS', 'PYTHON', 'JAVA', 'HTML', 'CSS', 'PHP', 'GO', 'RUBY', 'KOTLIN'],
      extraEnabledLanguagesInConnectedMode: [],
      disabledPluginKeysForAnalysis: [],
      sonarQubeConnections: [],
      sonarCloudConnections: [],
      sonarlintUserHome: join(tmpdir(), 'sonarlint-mcp'),
      standaloneRuleConfigByKey: {},
      isFocusOnNewCode: false,
      languageSpecificRequirements: {
        jsTsRequirements: {
          clientNodeJsPath: nodePath,  // Explicit Node path
          bundlePath: join(pluginDir, 'eslint-bridge')  // SLOOP appends /package/bin/server.cjs
        },
        // Also set in standalone requirements
        nodeJsPath: nodePath,
        omnisharpRequirements: {
          monoDistributionPath: null,
          dotNet6DistributionPath: null,
          dotNet472DistributionPath: null,
          ossAnalyzerPath: null,
          enterpriseAnalyzerPath: null
        }
      },
      isAutomaticAnalysisEnabled: true,
      telemetryMigration: null
    };

    await this.sendRequest('initialize', params);
  }

  private rejectAllPending(reason: string): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      try {
        await this.sendRequest('shutdown');
      } catch {
        console.error('[SLOOP] Shutdown request failed (process may already be exiting)');
      }
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
  }

  // Public API methods

  /**
   * List all standalone rule definitions from SLOOP.
   * Returns a map of rule key -> rule definition.
   */
  async listAllStandaloneRulesDefinitions(): Promise<any> {
    return this.sendRequest('rules/listAllStandaloneRulesDefinitions');
  }

  /**
   * Wait for a scope to become ready for analysis.
   * SLOOP emits didChangeAnalysisReadiness after processing addConfigurationScope.
   */
  waitForScopeReady(scopeId: string, timeoutMs = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeListener('scopeReady', onReady);
        reject(new Error(`Timeout waiting for scope ${scopeId} to become ready`));
      }, timeoutMs);

      const onReady = (readyScopeId: string) => {
        if (readyScopeId === scopeId) {
          clearTimeout(timer);
          this.removeListener('scopeReady', onReady);
          resolve();
        }
      };

      this.on('scopeReady', onReady);
    });
  }

  addConfigurationScope(scopeId: string, params: { name?: string, parentId?: string } = {}): void {
    this.sendNotification('configuration/didAddConfigurationScopes', {
      addedScopes: [{
        id: scopeId,
        parentId: params.parentId || null,
        bindable: false,
        name: params.name || scopeId,
        binding: null
      }]
    });
  }

  async analyzeFilesAndTrack(configScopeId: string, filePaths: string[]): Promise<any> {
    // Generate a random UUID for this analysis
    const analysisId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    console.error(`[ANALYSIS] Starting analysis for ${filePaths.length} files`);
    console.error(`[ANALYSIS] Files:`, filePaths);
    console.error(`[ANALYSIS] Scope ID: ${configScopeId}`);
    console.error(`[ANALYSIS] Analysis ID: ${analysisId}`);

    const startTime = Date.now();

    // Register files in SLOOP's virtual file system before analysis
    const projectRoot = scopeToProjectRoot.get(configScopeId);
    const fileDtos = buildClientFileDtos(filePaths, configScopeId, projectRoot);

    // Store so listFiles callback returns only these files, not a full directory scan
    const existing = scopeFiles.get(configScopeId) || [];
    scopeFiles.set(configScopeId, [...existing, ...fileDtos]);

    this.sendNotification('file/didUpdateFileSystem', {
      addedFiles: fileDtos,
      changedFiles: [],
      removedFiles: [],
    });
    console.error(`[ANALYSIS] Registered ${fileDtos.length} files in SLOOP VFS`);

    try {
      const result = await this.sendRequest('analysis/analyzeFilesAndTrack', {
        configurationScopeId: configScopeId,  // Note: different field name than analyzeFileList!
        analysisId: analysisId,
        filesToAnalyze: filePaths.map(path => `file://${path}`),
        extraProperties: {},
        shouldFetchServerIssues: false
      });

      const elapsed = Date.now() - startTime;
      console.error(`[ANALYSIS] Completed in ${elapsed}ms`);
      console.error(`[ANALYSIS] Result keys:`, Object.keys(result || {}));

      // Collect issues delivered via raiseIssues/raiseHotspots notifications
      const raisedIssues = this.issueCollector.getAndClear(analysisId);
      const raisedHotspots = this.issueCollector.getHotspotsAndClear(analysisId);
      console.error(`[ANALYSIS] Collected ${raisedIssues.length} raised issues, ${raisedHotspots.length} hotspots`);

      return {
        ...result,
        raisedIssues,
        raisedHotspots,
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(`[ANALYSIS] Failed after ${elapsed}ms:`, error);
      throw error;
    }
  }

}
