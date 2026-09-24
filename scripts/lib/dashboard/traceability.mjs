// Rastreabilidade SPEC → REQUISITO → TAREFA → IMPLEMENTAÇÃO → TESTE (e ADRs), só com vínculos
// explícitos. Relação que não pode ser provada pelos dados fica `UNKNOWN` — nunca é adivinhada.
//
// Vínculos aceitos (todos determinísticos):
//   spec → requisito      linhas `- **RF-01**:`, `- **RNF-01**:`, `- **CA-01**:` no corpo da spec
//   requisito → tarefa    o título da tarefa cita o ID do requisito
//   tarefa → arquivo      trace `file.modified` correlacionado à tarefa pelos hooks
//   requisito → teste     arquivo de teste que cita o ID da spec E o do requisito
//   spec → ADR            a spec cita `ADR-NNN` (frontmatter ou corpo)

export const UNKNOWN = 'UNKNOWN';
const REQ_LINE = /^\s*[-*]\s*\*{0,2}((?:RF|RNF|CA)-\d+)\*{0,2}\s*[:—–-]\s*(.*)$/;
const REQ_ID = /\b((?:RF|RNF|CA)-\d+)\b/g;
const ADR_ID = /\bADR-\d{1,5}\b/g;

/** Requisitos numerados do corpo de uma spec, na ordem, sem repetição. */
export function parseRequirements(text) {
  const out = [];
  const seen = new Set();
  const body = String(text ?? '');
  const lines = body.split(/\r?\n/);
  let inFrontmatter = lines[0] === '---';
  lines.forEach((line, i) => {
    if (inFrontmatter) { if (i > 0 && line === '---') inFrontmatter = false; return; }
    const m = line.match(REQ_LINE);
    if (!m || seen.has(m[1])) return;
    seen.add(m[1]);
    out.push({ id: m[1], kind: m[1].split('-')[0], text: m[2].replace(/\*\*/g, '').trim(), line: i + 1 });
  });
  return out;
}

export function requirementMentions(text) {
  return [...new Set(String(text ?? '').match(REQ_ID) ?? [])];
}

/** ADRs citados, normalizados para comparação (ADR-6 ≡ ADR-006 ≡ ADR-0006). */
export function adrMentions(text) {
  return [...new Set(String(text ?? '').match(ADR_ID) ?? [])];
}

export const adrKey = (id) => `ADR-${Number(String(id).replace(/^ADR-/, ''))}`;

/** Status do requisito pelo estado da spec (o guardião aprova cada CA com evidência). */
export function requirementStatus(specState, hasState) {
  if (!hasState) return { status: 'unknown', source: 'sem estado estruturado (.sdd/events.jsonl)' };
  if (!specState) return { status: 'pending', source: 'spec ainda não registrada no estado' };
  if (['approved', 'implemented'].includes(specState.status)) return { status: 'verified', source: `GUARDIAN_APPROVED (spec ${specState.status})` };
  if (['in_progress', 'in_review'].includes(specState.status)) return { status: 'in_progress', source: `spec ${specState.status}` };
  if (specState.status === 'archived') return { status: 'pending', source: 'spec arquivada' };
  return { status: 'pending', source: `spec ${specState.status}` };
}

/** Testes de uma tarefa: os dos requisitos que ela cita; sem citação, os de todos os requisitos da spec. */
export function testsForTask(spec, task) {
  const reqs = (spec?.requirements ?? []).filter((r) => !task.requirements.length || task.requirements.includes(r.id));
  return [...new Set(reqs.flatMap((r) => r.testRefs))];
}

/**
 * Cadeia "por quê?" de uma tarefa, requisito ou arquivo. Cada nó diz de onde veio o vínculo.
 * @returns {{ title: string, nodes: { kind: string, id: string, detail?: string, via?: string }[], notes: string[] }}
 */
export function whyChain(snapshot, { kind, id }) {
  const notes = [];
  const specOf = (sid) => snapshot.specs.find((s) => s.id === sid);
  const nodes = [];
  const pushSpec = (s) => {
    nodes.push({ kind: 'pedido', id: UNKNOWN, detail: 'o pedido original do usuário não é rastreado nos dados do SDD (brief em specs/_entrada/)', via: '—' });
    if (s) nodes.push({ kind: 'spec', id: s.id, detail: s.title ?? '', via: s.file });
  };
  if (kind === 'task') {
    const t = snapshot.tasks.find((x) => x.id === id);
    if (!t) return { title: `WHY? ${id}`, nodes: [], notes: ['tarefa não encontrada'] };
    const s = specOf(t.spec);
    pushSpec(s);
    if (t.requirements.length) for (const r of t.requirements) nodes.push({ kind: 'requisito', id: r, detail: s?.requirements.find((x) => x.id === r)?.text ?? '', via: 'citado no título da tarefa' });
    else nodes.push({ kind: 'requisito', id: UNKNOWN, detail: 'o título da tarefa não cita RF-/CA-; vínculo só pela spec', via: '—' });
    for (const a of s?.adrs ?? []) nodes.push({ kind: 'adr', id: a.id, detail: a.exists ? a.title ?? '' : 'citado, mas não encontrado', via: 'citado na spec' });
    nodes.push({ kind: 'tarefa', id: t.id, detail: `${t.title} (@${t.agent})`, via: t.file ?? 'specs/tasks' });
    if (t.files.length) for (const f of t.files) nodes.push({ kind: 'arquivo', id: f, via: 'trace file.modified' });
    else nodes.push({ kind: 'arquivo', id: UNKNOWN, detail: 'nenhuma modificação correlacionada pelo trace', via: '—' });
    const tests = testsForTask(s, t);
    if (tests.length) for (const f of tests) nodes.push({ kind: 'teste', id: f, via: 'arquivo de teste cita spec + requisito' });
    else nodes.push({ kind: 'teste', id: UNKNOWN, detail: 'nenhum arquivo de teste cita a spec e o requisito', via: '—' });
    return { title: `WHY? ${t.id}`, nodes, notes };
  }
  if (kind === 'requirement') {
    const [sid, rid] = id.split('::');
    const s = specOf(sid);
    const r = s?.requirements.find((x) => x.id === rid);
    if (!r) return { title: `WHY? ${id}`, nodes: [], notes: ['requisito não encontrado'] };
    pushSpec(s);
    nodes.push({ kind: 'requisito', id: r.id, detail: r.text, via: `${r.file}:${r.line}` });
    for (const a of s.adrs) nodes.push({ kind: 'adr', id: a.id, detail: a.exists ? a.title ?? '' : 'citado, mas não encontrado', via: 'citado na spec' });
    if (r.tasks.length) for (const t of r.tasks) nodes.push({ kind: 'tarefa', id: t, via: 'título cita o requisito' });
    else nodes.push({ kind: 'tarefa', id: UNKNOWN, detail: `nenhuma tarefa cita ${r.id}; tarefas da spec: ${s.taskIds.join(', ') || 'nenhuma'}`, via: '—' });
    if (r.implementation.length) for (const f of r.implementation) nodes.push({ kind: 'arquivo', id: f, via: 'trace das tarefas vinculadas' });
    else nodes.push({ kind: 'arquivo', id: UNKNOWN, via: '—' });
    if (r.testRefs.length) for (const f of r.testRefs) nodes.push({ kind: 'teste', id: f, via: 'cita spec + requisito' });
    else nodes.push({ kind: 'teste', id: UNKNOWN, via: '—' });
    return { title: `WHY? ${s.id} ${r.id}`, nodes, notes };
  }
  if (kind === 'file') {
    const f = snapshot.files.find((x) => x.path === id);
    const tasks = f?.tasks ?? [];
    if (!tasks.length) return { title: `WHY? ${id}`, nodes: [{ kind: 'arquivo', id }], notes: ['No traceability metadata available — nenhuma tarefa correlacionada a este arquivo pelo trace'] };
    for (const tid of tasks) {
      const t = snapshot.tasks.find((x) => x.id === tid);
      const s = specOf(t?.spec ?? tid.split('/')[0]);
      if (s) nodes.push({ kind: 'spec', id: s.id, detail: s.title ?? '', via: s.file });
      for (const r of t?.requirements ?? []) nodes.push({ kind: 'requisito', id: r, via: 'título da tarefa' });
      for (const a of s?.adrs ?? []) nodes.push({ kind: 'adr', id: a.id, via: 'citado na spec' });
      nodes.push({ kind: 'tarefa', id: tid, detail: t?.title ?? '', via: 'trace file.modified' });
    }
    nodes.push({ kind: 'arquivo', id, detail: `${f.modifications} modificação(ões)`, via: 'trace' });
    return { title: `WHY? ${id}`, nodes, notes };
  }
  return { title: 'WHY?', nodes: [], notes: [`tipo desconhecido '${kind}'`] };
}
