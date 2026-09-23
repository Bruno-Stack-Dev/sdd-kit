// Geração determinística de artefatos: templates do motor e `sdd spec new`.
// Plano e tarefas são gerados a partir da pipeline da config — nenhum pipeline fica hardcoded.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE_ROOT } from './engine.mjs';

const TEMPLATE_DIR = join(ENGINE_ROOT, 'specs', '_templates');
const EXTRA_TEMPLATES = {
  config: join(ENGINE_ROOT, 'sdd.config.example.yaml'),
  skill: join(ENGINE_ROOT, '.claude', 'skills', '_template-skill.md'),
};

export function listTemplates() {
  const names = existsSync(TEMPLATE_DIR)
    ? readdirSync(TEMPLATE_DIR).filter((f) => /^template-.+\.md$/.test(f)).map((f) => f.slice('template-'.length, -3))
    : [];
  return [...names, ...Object.keys(EXTRA_TEMPLATES)].sort();
}

export function templatePath(name) {
  if (EXTRA_TEMPLATES[name]) return EXTRA_TEMPLATES[name];
  const clean = String(name).replace(/^template-/, '').replace(/\.md$/, '');
  const p = join(TEMPLATE_DIR, `template-${clean}.md`);
  return existsSync(p) ? p : null;
}

export function readTemplate(name) {
  const p = templatePath(name);
  if (!p) return null;
  return readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

/** Pipeline escolhida: --pipeline explícito, senão a primeira declarada na config. */
export function choosePipeline(config, name) {
  const pipelines = config?.pipelines ?? {};
  if (name) {
    if (!pipelines[name]) throw new Error(`pipeline '${name}' não existe na config (há: ${Object.keys(pipelines).join(', ') || 'nenhuma'})`);
    return { name, steps: pipelines[name] };
  }
  const first = Object.keys(pipelines)[0];
  if (!first) throw new Error('a config não declara pipelines');
  return { name: first, steps: pipelines[first] };
}

export function renderSpec({ id, title, deps = [], date }) {
  const t = readTemplate('spec');
  return t
    .replace(/<PREFIXO>NNN/g, id)
    .replace('<Título descritivo e específico>', title)
    .replace(/<Título>/g, title)
    .replace(/AAAA-MM-DD/g, date)
    .replace(/depende-de: \[\][^\n]*/, `depende-de: [${deps.join(', ')}]`);
}

export function renderPlan({ id, title, pipeline, date }) {
  const phases = pipeline.steps.map((s, i) => [
    `### Fase ${i + 1} — ${s.name}`,
    `- **Etapa da pipeline:** \`${s.id}\` · **Agente:** \`@${s.agent}\`${s.when ? ` · **Quando:** ${s.when}` : ''}`,
    `- **Pronto quando:** ${s.output ?? '<critério observável>'}${s.guardian ? ' — e `GUARDIAN_APPROVED` registrado com evidência.' : ''}`,
    '',
  ].join('\n'));
  const nodes = pipeline.steps.map((s) => s.id.replace(/[^A-Za-z0-9]/g, '_'));
  return [
    '---',
    `plano-id: ${id}`,
    `spec-relacionada: ${id}`,
    `titulo: "Plano de Implementação — ${title.replace(/"/g, "'")}"`,
    'versao: 0.1.0',
    'status: rascunho',
    `atualizado-em: ${date}`,
    `pipeline: ${pipeline.name}`,
    'tags: [plano]',
    '---',
    '',
    `# ${id}: Plano — ${title}`,
    '',
    '## 🧭 Contexto resumido',
    `> Executa a spec \`${id}\` pela pipeline \`${pipeline.name}\` da config. Objetivo: <entregar X>.`,
    '',
    '## ✅ Pré-requisitos',
    '- [ ] <bloqueador que precisa estar resolvido antes de iniciar>',
    '',
    '## 📅 Fases de trabalho',
    '',
    '> Geradas a partir de `pipelines.' + pipeline.name + '` do `sdd.config.yaml` — uma fase por etapa.',
    '',
    ...phases,
    '## 🔗 Dependências',
    '```mermaid',
    'graph TD',
    `    ${nodes.join(' --> ')}`,
    '```',
    '',
    '## 🎯 Critérios de saída',
    '- [ ] Suíte verde (`commands` da config) com `TEST_PASSED` registrado',
    '- [ ] Cada CA com evidência (implementação + teste; negativo quando houver regra crítica)',
    '- [ ] `sdd check forbidden` no esperado',
    '- [ ] `GUARDIAN_APPROVED` e `SPEC_IMPLEMENTED` registrados; LEDGER regenerado',
    '',
  ].join('\n');
}

export function renderTasks({ id, title, pipeline, date }) {
  const lines = pipeline.steps.map((s, i) => {
    const tid = `T-${String(i + 1).padStart(3, '0')}`;
    const dep = i > 0 ? ` 🔒 T-${String(i).padStart(3, '0')}` : '';
    return `- [ ] [${tid}] ${s.name}${s.output ? ` — ${s.output}` : ''} (@${s.agent})${dep}`;
  });
  return [
    '---',
    `tarefas-de: ${id}`,
    `plano-relacionado: ${id}`,
    'status: rascunho',
    `atualizado-em: ${date}`,
    `pipeline: ${pipeline.name}`,
    'tags: [tarefas]',
    '---',
    '',
    `# Tarefas — ${title}`,
    '',
    '## Convenções',
    '- ID global: `<spec>/T-NNN` (ex.: `' + id + '/T-001`). Uma tarefa por etapa da pipeline `' + pipeline.name + '`.',
    '- Status: **o estado é a autoridade** (`sdd event TASK_*`); os checkboxes são reescritos por `sdd tasks sync`.',
    '  `[ ]` pendente · `[~]` em andamento · `[!]` bloqueada · `[x]` concluída · `[-]` cancelada.',
    '- Dependências: `🔒 T-NNN` (mesma spec) ou `🔒 SPEC/T-NNN` (outra spec).',
    '',
    '## Tarefas',
    '',
    ...lines,
    '',
    '## Definition of Done',
    '- [ ] Cada CA da spec tem teste · [ ] Suíte verde · [ ] Padrões proibidos no esperado',
    '- [ ] Guardião aprovou com evidência · [ ] Spec atualizada se houve divergência',
    '',
  ].join('\n');
}
