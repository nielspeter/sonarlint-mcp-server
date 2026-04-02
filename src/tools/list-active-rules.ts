import { ensureSloopBridge } from '../utils/sloop.js';

function formatParams(paramsByKey: Record<string, any> | undefined): string {
  if (!paramsByKey) return '';
  const entries = Object.values(paramsByKey);
  if (entries.length === 0) return '';
  return entries.map((p: any) => `${p.key}=${p.defaultValue} (${p.type})`).join(', ');
}

export async function handleListActiveRules(args: any) {
  const { language } = args as { language?: string };

  const langSuffix = language ? ` for ${language}` : '';
  console.error(`[MCP] Listing active rules${langSuffix}`);

  const bridge = await ensureSloopBridge();

  try {
    const response = await bridge.listAllStandaloneRulesDefinitions();
    const rulesByKey: Record<string, any> = response.rulesByKey || {};

    // Group rules by language
    const rulesByLanguage = new Map<string, any[]>();
    for (const [key, rule] of Object.entries(rulesByKey)) {
      const ruleDef = rule as any;
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
    let configurableCount = 0;

    const sortedLangs = [...rulesByLanguage.keys()].sort((a, b) => a.localeCompare(b));

    for (const lang of sortedLangs) {
      const rules = rulesByLanguage.get(lang)!;
      totalRules += rules.length;

      output += `## ${lang} (${rules.length} rules)\n\n`;
      output += `| Rule | Name | Parameters | Impacts |\n`;
      output += `|------|------|------------|----------|\n`;

      rules.sort((a: any, b: any) => a.key.localeCompare(b.key));

      for (const rule of rules) {
        const impacts = (rule.softwareImpacts || [])
          .map((i: any) => `${i.softwareQuality}:${i.impactSeverity}`)
          .join(', ');
        const params = formatParams(rule.paramsByKey);
        if (params) configurableCount++;
        output += `| \`${rule.key}\` | ${rule.name} | ${params} | ${impacts} |\n`;
      }
      output += `\n`;
    }

    output = output.replace(
      '# Active SonarLint Rules\n\n',
      `# Active SonarLint Rules\n\n**Total Active Rules**: ${totalRules} (${configurableCount} configurable)\n\n`,
    );

    return {
      content: [{ type: 'text' as const, text: output }],
    };
  } catch (error) {
    console.error('[MCP] Failed to list rules from SLOOP:', error);

    return {
      content: [
        {
          type: 'text' as const,
          text: `# Active SonarLint Rules\n\nFailed to retrieve rules from SLOOP backend. Ensure the server is running and try again.\n\nError: ${error}\n`,
        },
      ],
    };
  }
}
