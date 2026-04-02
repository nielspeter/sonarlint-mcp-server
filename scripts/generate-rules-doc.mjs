#!/usr/bin/env node

/**
 * Generates docs/configurable-rules.md from the SLOOP backend.
 * Usage: npm run docs:rules
 */

import { SloopBridge } from '../dist/sloop-bridge.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, '..', 'docs', 'configurable-rules.md');

const bridge = new SloopBridge();
await bridge.connect();

const result = await bridge.listAllStandaloneRulesDefinitions();
const rulesByKey = result.rulesByKey || {};

// Group configurable rules by language
const byLang = new Map();
for (const [key, rule] of Object.entries(rulesByKey)) {
  if (!rule.paramsByKey || Object.keys(rule.paramsByKey).length === 0) continue;
  const lang = rule.language || 'UNKNOWN';
  if (!byLang.has(lang)) byLang.set(lang, []);
  byLang.get(lang).push({ key, ...rule });
}

let total = 0;
const sortedLangs = [...byLang.keys()].sort();

let md = '# Configurable SonarLint Rules\n\n';

// Placeholder for total count (replaced below)
const totalPlaceholder = '{{TOTAL}}';
md += totalPlaceholder + '\n\n';

md += '> Auto-generated from SLOOP backend. Regenerate with `npm run docs:rules`.\n';
md += '>\n';
md += "> Configure these rules in your project's `sonarlint.json`:\n";
md += '>\n';
md += '> ```json\n';
md += '> {\n';
md += '>   "rules": {\n';
md += '>     "javascript:S3776": {\n';
md += '>       "level": "on",\n';
md += '>       "parameters": { "threshold": "20" }\n';
md += '>     }\n';
md += '>   }\n';
md += '> }\n';
md += '> ```\n\n';

for (const lang of sortedLangs) {
  const rules = byLang.get(lang);
  rules.sort((a, b) => a.key.localeCompare(b.key));
  total += rules.length;

  md += `## ${lang} (${rules.length} rules)\n\n`;
  md += '| Rule | Name | Parameter | Default | Type |\n';
  md += '|------|------|-----------|---------|------|\n';

  for (const rule of rules) {
    const params = Object.values(rule.paramsByKey);
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      const ruleCol = i === 0 ? `\`${rule.key}\`` : '';
      const nameCol = i === 0 ? rule.name : '';
      const defVal = p.defaultValue === null ? '—' : `\`${p.defaultValue}\``;
      md += `| ${ruleCol} | ${nameCol} | \`${p.key}\` | ${defVal} | ${p.type} |\n`;
    }
  }
  md += '\n';
}

md = md.replace(
  totalPlaceholder,
  `**${total} configurable rules** across ${sortedLangs.length} languages.`,
);

writeFileSync(OUTPUT, md);
console.log(`Wrote ${total} configurable rules to ${OUTPUT}`);

await bridge.disconnect();
process.exit(0);
