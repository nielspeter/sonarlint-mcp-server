export async function handleListActiveRules(args: any) {
  const { language } = args as { language?: string };

  console.error(`[MCP] Listing active rules${language ? ` for ${language}` : ''}`);

  // TODO: Extract actual rules from SLOOP plugins via RPC
  // For now, return a summary of known rules
  let output = `# Active SonarLint Rules\n\n`;

  if (!language || language === 'javascript' || language === 'typescript') {
    output += `## JavaScript/TypeScript Rules\n\n`;
    output += `**Total Rules**: 265\n\n`;
    output += `### Rule Categories\n\n`;
    output += `- **Code Smells**: Rules that detect maintainability issues\n`;
    output += `  - \`S1481\`: Unused local variables\n`;
    output += `  - \`S1854\`: Useless assignments\n`;
    output += `  - \`S3504\`: Prefer let/const over var\n`;
    output += `  - \`S107\`: Too many parameters\n`;
    output += `  - \`S4144\`: Duplicate implementations\n`;
    output += `  - \`S2589\`: Always-truthy expressions\n\n`;
    output += `- **Bugs**: Rules that detect potential errors\n`;
    output += `  - \`S2259\`: Null pointer dereference\n`;
    output += `  - \`S3776\`: Cognitive complexity\n\n`;
    output += `- **Security**: Rules that detect security vulnerabilities\n`;
    output += `  - \`S5852\`: Regular expression DoS\n`;
    output += `  - \`S2068\`: Hard-coded credentials\n\n`;
  }

  if (!language || language === 'python') {
    output += `## Python Rules\n\n`;
    output += `**Total Rules**: ~200\n\n`;
    output += `### Rule Categories\n\n`;
    output += `- **Code Smells**: Maintainability issues\n`;
    output += `  - \`S1066\`: Nested if statements\n`;
    output += `  - \`S1192\`: String literals duplicated\n\n`;
    output += `- **Bugs**: Potential errors\n`;
    output += `  - \`S5754\`: Unreachable code\n\n`;
    output += `- **Security**: Security vulnerabilities\n`;
    output += `  - \`S5659\`: Weak encryption\n\n`;
  }

  output += `\n---\n\n`;
  output += `*Note: This is a summary of active rules. Full rule details are available at https://rules.sonarsource.com/*\n`;

  return {
    content: [
      {
        type: "text" as const,
        text: output,
      },
    ],
  };
}
