import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync } from 'fs';

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
    if (!this.process || !this.process.stdout) return;

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
      const headerMatch = this.messageBuffer.match(/Content-Length: (\d+)\r?\n\r?\n/);
      if (!headerMatch) break;

      const contentLength = parseInt(headerMatch[1]);
      const headerEnd = headerMatch.index! + headerMatch[0].length;
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

      // Emit specific events for well-known notifications
      if (message.method === 'log') {
        this.emit('log', message.params);
      }
    }
  }

  private findFilesInDirectory(dir: string, baseDir?: string): string[] {
    if (!baseDir) baseDir = dir;
    const files: string[] = [];

    try {
      const items = readdirSync(dir);
      for (const item of items) {
        const fullPath = join(dir, item);
        const relativePath = relative(baseDir, fullPath);

        // Skip excluded directories
        if (relativePath.startsWith('node_modules') || relativePath.startsWith('.git') ||
            relativePath.startsWith('dist') || relativePath.startsWith('build')) {
          continue;
        }

        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...this.findFilesInDirectory(fullPath, baseDir));
        } else if (stat.isFile()) {
          // Only include source files
          if (/\.(js|ts|py|java|html|css|php|go|rb)$/.test(item)) {
            files.push(`file://${fullPath}`);
          }
        }
      }
    } catch (err) {
      console.error('Error reading directory:', dir, err);
    }

    return files;
  }

  private handleClientRequest(request: any): void {
    console.error(`[DEBUG] Handling client request: ${request.method}`);

    // Implement listFiles - SLOOP needs to know what files exist
    if (request.method === 'listFiles') {
      const configScopeId = request.params?.configScopeId;
      const baseDir = process.cwd();
      const fileDtos: any[] = [];

      // Helper to detect language from extension
      const detectLanguage = (filePath: string): string | null => {
        if (filePath.endsWith('.js')) return 'JS';
        if (filePath.endsWith('.ts')) return 'TS';
        if (filePath.endsWith('.py')) return 'PYTHON';
        if (filePath.endsWith('.java')) return 'JAVA';
        if (filePath.endsWith('.html')) return 'HTML';
        if (filePath.endsWith('.css')) return 'CSS';
        return null;
      };

      // Scan root directory for source files
      try {
        const rootItems = readdirSync(baseDir);
        for (const item of rootItems) {
          const fullPath = join(baseDir, item);
          try {
            const stat = statSync(fullPath);
            if (stat.isFile() && /\.(js|ts|py|java|html|css|php|go|rb)$/.test(item)) {
              const content = readFileSync(fullPath, 'utf-8');
              const relativePath = relative(baseDir, fullPath);
              const language = detectLanguage(fullPath);

              // Debug: Log first 200 chars of content for test files
              if (item === 'test-simple.js' || item === 'test-python.py') {
                console.error(`[DEBUG listFiles] ${item}: ${content.substring(0, 200)}`);
              }

              fileDtos.push({
                uri: `file://${fullPath}`,
                fsPath: fullPath,
                ideRelativePath: relativePath,
                configScopeId: configScopeId,
                isTest: false,
                charset: 'UTF-8',
                content: content,
                detectedLanguage: language,
                isUserDefined: true  // CRITICAL: Must be true for SLOOP to analyze!
              });
            } else if (stat.isDirectory() && item === 'src') {
              // Only scan src directory recursively
              const srcFiles = this.findFilesInDirectory(fullPath);
              for (const fileUri of srcFiles) {
                const filePath = fileUri.replace('file://', '');
                try {
                  const content = readFileSync(filePath, 'utf-8');
                  const relativePath = relative(baseDir, filePath);
                  const language = detectLanguage(filePath);

                  fileDtos.push({
                    uri: fileUri,
                    fsPath: filePath,
                    ideRelativePath: relativePath,
                    configScopeId: configScopeId,
                    isTest: relativePath.includes('test'),
                    charset: 'UTF-8',
                    content: content,
                    detectedLanguage: language,
                    isUserDefined: true  // CRITICAL: Must be true for SLOOP to analyze!
                  });
                } catch (readErr) {
                  console.error(`Could not read file ${filePath}:`, readErr);
                }
              }
            }
          } catch (e) {
            // Skip files we can't access
          }
        }
      } catch (err) {
        console.error('Error listing files:', err);
      }

      console.error(`[DEBUG] Returning ${fileDtos.length} ClientFileDto objects for listFiles`);
      this.sendResponse(request.id, { files: fileDtos });
      return;
    }

    // Implement getBaseDir - SLOOP needs the base directory for the config scope
    if (request.method === 'getBaseDir') {
      // Return current working directory as base dir
      const basePath = process.cwd();
      this.sendResponse(request.id, { path: basePath });
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
    // Analysis operations need more time, especially TypeScript which spawns external processes
    const timeoutMs = method.includes('analyze') ? 60000 : 30000; // 60s for analysis, 30s for others

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
      } catch (err) {
        // Ignore shutdown errors
      }
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
  }

  // Public API methods
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

    try {
      // Returns AnalyzeFilesResponse with rawIssues directly
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

      return result;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(`[ANALYSIS] Failed after ${elapsed}ms:`, error);
      throw error;
    }
  }

}
