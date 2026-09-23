// `sdd project classify [--json]` — greenfield × brownfield com evidência (o usuário confirma).
import { UsageError, ICON } from '../lib/cli.mjs';
import { classifyProject } from '../lib/classify.mjs';

export async function projectCommand({ positional, flags, root }) {
  if (positional[0] !== 'classify') throw new UsageError('uso: project classify [--json]');
  const r = classifyProject(root);
  if (flags.json) { console.log(JSON.stringify(r, null, 2)); return 0; }
  console.log(`${ICON.info} projeto ${r.classification === 'brownfield' ? 'EXISTENTE (brownfield)' : 'NOVO (greenfield)'} — confiança ${r.confidence} (pontuação ${r.score})`);
  for (const e of r.evidence) console.log(`  · ${e}`);
  console.log('Confirme com o usuário antes de rotear (discovery × auditoria).');
  return 0;
}
