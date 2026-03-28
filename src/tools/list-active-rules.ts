import { ensureSloopBridge } from "../utils/sloop.js";

export async function handleListActiveRules(args: any) {
  const { language } = args as { language?: string };

  console.error(`[MCP] Listing active rules${language ? ` for ${language}` : ''}`);

  const bridge = await ensureSloopBridge();

  try {
    const response = await bridge.listAllStandaloneRulesDefinitions();
    const rulesByKey: Record<string, any> = response.rulesByKey || {};

    // Group rules by language
    const rulesByLanguage = new Map<string, any[]>();
    for (const [key, rule] of Object.entries(rulesByKey)) {
      const ruleDef = rule as any;
      // Filter by language if specified
      const ruleLang = ruleDef.language?.toLowerCase();
      if (language && ruleLang !== language.toLowerCase()) {
        continue;
      }
      if (!ruleDef.isActiveByDefault) continue;

      const lang = ruleDef.language || 'unknown';
      if (!rulesByLanguage.has(lang)) {
        rulesByLanguage.set(lang, []);
      }
      rulesByLanguage.get(lang)!.push({ key, ...ruleDef });
    }

    let output = `# Active SonarLint Rules\n\n`;
    let totalRules = 0;

    // Sort languages alphabetically
    const sortedLangs = [...rulesByLanguage.keys()].sort();

    for (const lang of sortedLangs) {
      const rules = rulesByLanguage.get(lang)!;
      totalRules += rules.length;

      output += `## ${lang} (${rules.length} rules)\n\n`;
      output += `| Rule | Name | Clean Code | Impacts |\n`;
      output += `|------|------|------------|----------|\n`;

      // Sort by rule key
      rules.sort((a: any, b: any) => a.key.localeCompare(b.key));

      for (const rule of rules) {
        const impacts = (rule.softwareImpacts || [])
          .map((i: any) => `${i.softwareQuality}:${i.impactSeverity}`)
          .join(', ');
        const cleanCode = rule.cleanCodeAttribute || '';
        output += `| \`${rule.key}\` | ${rule.name} | ${cleanCode} | ${impacts} |\n`;
      }
      output += `\n`;
    }

    output = output.replace(
      '# Active SonarLint Rules\n\n',
      `# Active SonarLint Rules\n\n**Total Active Rules**: ${totalRules}\n\n`
    );

    return {
      content: [{ type: "text" as const, text: output }],
    };
  } catch (error) {
    console.error('[MCP] Failed to list rules from SLOOP:', error);

    // Fallback: return basic info if SLOOP RPC fails
    return {
      content: [{
        type: "text" as const,
        text: `# Active SonarLint Rules\n\nFailed to retrieve rules from SLOOP backend. Ensure the server is running and try again.\n\nError: ${error}\n`,
      }],
    };
  }
}
