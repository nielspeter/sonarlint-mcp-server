import { existsSync, statSync, readdirSync } from "fs";
import { join, extname, relative, basename } from "path";
import { SloopError } from "../errors.js";
import { handleAnalyzeFiles } from "./analyze-files.js";

export async function handleAnalyzeProject(args: any) {
  const { projectPath, maxFiles = 100, minSeverity, excludeRules, includePatterns } = args as {
    projectPath: string;
    maxFiles?: number;
    minSeverity?: string;
    excludeRules?: string[];
    includePatterns?: string[];
  };

  // Validate project path exists
  if (!existsSync(projectPath)) {
    throw new SloopError(
      `Project path not found: ${projectPath}`,
      `The directory ${projectPath} does not exist. Please check the path and try again.`,
      false
    );
  }

  const stats = statSync(projectPath);
  if (!stats.isDirectory()) {
    throw new SloopError(
      `Not a directory: ${projectPath}`,
      `The path ${projectPath} is not a directory. Please provide a directory path.`,
      false
    );
  }

  console.error(`[MCP] Scanning project: ${projectPath}`);

  // Define supported extensions
  const supportedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.php', '.rb', '.html', '.css', '.xml'];

  // Directories to exclude
  const excludeDirs = new Set([
    'node_modules', 'dist', 'build', '.git', '.svn', '.hg',
    'coverage', '.next', '.nuxt', 'out', 'target', 'bin',
    '__pycache__', '.pytest_cache', '.mypy_cache', 'venv', '.venv'
  ]);

  // Recursively find all source files
  function findSourceFiles(dir: string, files: string[] = []): string[] {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip excluded directories
        if (entry.isDirectory() && excludeDirs.has(entry.name)) {
          continue;
        }

        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          findSourceFiles(fullPath, files);
        } else if (entry.isFile()) {
          const ext = extname(entry.name);
          if (supportedExtensions.includes(ext)) {
            // Check includePatterns if specified
            if (includePatterns && includePatterns.length > 0) {
              const relativePath = relative(projectPath, fullPath);
              // Simple pattern matching (supports ** and *)
              const matches = includePatterns.some(pattern => {
                const regex = new RegExp(
                  '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
                );
                return regex.test(relativePath);
              });
              if (matches) {
                files.push(fullPath);
              }
            } else {
              files.push(fullPath);
            }
          }
        }
      }
    } catch (err) {
      console.error(`[MCP] Error scanning directory ${dir}:`, err);
    }

    return files;
  }

  const allFiles = findSourceFiles(projectPath);
  console.error(`[MCP] Found ${allFiles.length} source files`);

  if (allFiles.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `No source files found in ${projectPath}.\n\nSupported extensions: ${supportedExtensions.join(', ')}`,
        },
      ],
    };
  }

  // Limit number of files
  const filesToAnalyze = allFiles.slice(0, maxFiles);
  if (allFiles.length > maxFiles) {
    console.error(`[MCP] Limiting analysis to ${maxFiles} files (found ${allFiles.length})`);
  }

  // Use handleAnalyzeFiles to do the actual analysis
  const result = await handleAnalyzeFiles({
    filePaths: filesToAnalyze,
    groupByFile: true,
    minSeverity,
    excludeRules,
  });

  // Add project-specific context to the output
  const resultText = result.content[0].text;
  const projectSummary = `
📦 Project Scan: ${basename(projectPath)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Project Path: ${projectPath}
Total Source Files: ${allFiles.length}
Files Analyzed: ${filesToAnalyze.length}
${allFiles.length > maxFiles ? `⚠️  Limited to ${maxFiles} files (use maxFiles parameter to adjust)\n` : ''}
${resultText}
`;

  return {
    content: [
      {
        type: "text" as const,
        text: projectSummary,
      },
    ],
  };
}
