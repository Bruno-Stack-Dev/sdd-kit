// `sdd lsp detect [--json]` — linguagens, language servers e plugins LSP recomendados.
import { UsageError, ICON } from '../lib/cli.mjs';
import { detectLanguages } from '../lib/lsp.mjs';
import { stringifyYaml } from '../lib/yaml.mjs';

export async function lspCommand({ positional, flags, root }) {
  if (positional[0] !== 'detect') throw new UsageError('uso: lsp detect [--json]');
  const r = detectLanguages(root);
  if (flags.json) { console.log(JSON.stringify(r, null, 2)); return 0; }
  if (!r.languages.length) console.log('nenhuma linguagem com plugin LSP oficial detectada');
  for (const l of r.languages) {
    console.log(`${l.binaryFound ? ICON.ok : ICON.warn} ${l.label} — ${l.evidence.join(', ')}`);
    console.log(`    plugin: /plugin install ${l.plugin}`);
    console.log(`    binário: ${l.binary} ${l.binaryFound ? `(encontrado: ${l.binaryPath})` : `(NÃO encontrado no PATH — ${l.install})`}`);
  }
  for (const u of r.unsupported) console.log(`${ICON.info} ${u}: sem plugin LSP oficial — alternativa: Serena (MCP, ver docs/architecture/code-intelligence.md)`);
  if (r.languages.length) {
    const snippet = stringifyYaml({ integrations: { lsp: { enabled: true, languages: r.languages.map((l) => l.language), plugins: r.languages.map((l) => l.plugin) } } });
    console.log(`\nPara registrar na config (sdd.config.yaml), acrescente/mescle:\n${snippet}`);
    console.log('A instalação do binário e do plugin é decisão sua (supply chain): o kit não instala nada.');
  }
  return 0;
}
