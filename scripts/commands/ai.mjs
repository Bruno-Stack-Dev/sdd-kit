// `sdd ai detect [--json]` — o produto usa IA? Quais sinais? Quais artefatos AI-* gerar?
import { UsageError, ICON } from '../lib/cli.mjs';
import { detectAi } from '../lib/ai-detect.mjs';

export async function aiCommand({ positional, flags, root }) {
  if (positional[0] !== 'detect') throw new UsageError('uso: ai detect [--json]');
  const r = detectAi(root);
  if (flags.json) { console.log(JSON.stringify(r, null, 2)); return 0; }
  if (!r.uses_ai) { console.log(`${ICON.info} nenhum sinal de IA no produto (LLM, agentes, RAG, memória, serving) — pack ai desnecessário`); return 0; }
  console.log(`${ICON.info} o produto usa IA. Sinais:`);
  for (const [cat, hits] of Object.entries(r.signals)) console.log(`  ${cat.padEnd(18)} ${hits.join(', ')}`);
  console.log(`\nSugestão: \`sdd pack activate ai\` e a skill ai-discovery; artefatos: ${r.suggested_artifacts.join(', ')}.`);
  console.log('Os pacotes detectados são do projeto — o SDD Kit não instala nenhum deles.');
  return 0;
}
