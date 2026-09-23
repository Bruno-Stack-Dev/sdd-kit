// Gera projetos sintéticos (em diretório temporário) para testes de estado, doctor e hooks.
import { stringifyYaml } from '../../scripts/lib/yaml.mjs';
import { tempProject } from '../helpers.mjs';

export function baseConfig(overrides = {}) {
  return {
    version: 3,
    project: { name: 'Biblioteca Escolar', type: 'SaaS web', domain: 'empréstimos', stage: 'mock-first', updated_at: '2026-09-23' },
    stack: { framework: 'Vue 3 + TypeScript', state: 'Pinia', package_manager: 'npm' },
    commands: { test: 'node -e "process.exit(0)"', e2e: null, typecheck: null },
    paths: { specs: 'specs/', contracts: 'src/types/' },
    numbering: { prefix: 'BIB-', increment: 10, start: 'auto' },
    pipelines: {
      frontend: [
        { id: 'contratos', name: 'Contratos', agent: 'agente-arquiteto-contratos' },
        { id: 'store', name: 'Store', agent: 'agente-frontend' },
        { id: 'testes', name: 'Testes', agent: 'agente-qa-testes' },
        { id: 'guardiao', name: 'Guardião', agent: 'agente-spec-guardian', guardian: true },
      ],
    },
    rules: ['Spec-driven.'],
    forbidden_patterns: [{ pattern: 'Date\\.now\\(\\)', scope: 'src/', expected: 0 }],
    human_gates: [],
    blocked_topics: [],
    ...overrides,
  };
}

export function spec(id, { status = 'rascunho', deps = [], cas = 2, title = `Spec ${id}` } = {}) {
  return [
    '---',
    `spec-id: ${id}`,
    `titulo: ${title}`,
    `status: ${status}`,
    `cas: ${cas}`,
    `depende-de: [${deps.join(', ')}]`,
    '---',
    '',
    `# ${id}`,
    '',
    '## Critérios de Aceitação',
    '',
    ...Array.from({ length: cas }, (_, i) => `- **CA-0${i + 1}**: comportamento ${i + 1}`),
    '',
  ].join('\n');
}

export function plan(id) {
  return `---\nplano-id: ${id}\nspec-relacionada: ${id}\ntitulo: Plano ${id}\nstatus: rascunho\n---\n\n# Plano\n`;
}

/** tasks: [{ id:'T-001', agent:'agente-x', deps:['T-000'], box:' ' }] */
export function tasks(specId, list) {
  const lines = list.map((t) => `- [${t.box ?? ' '}] [${t.id}] ${t.title ?? `tarefa ${t.id}`} (@${t.agent})${t.deps?.length ? ` 🔒 ${t.deps.join(', ')}` : ''}`);
  return `---\ntarefas-de: ${specId}\nplano-relacionado: ${specId}\nstatus: rascunho\n---\n\n# Tarefas\n\n${lines.join('\n')}\n`;
}

export const STANDARD_TASKS = [
  { id: 'T-001', agent: 'agente-arquiteto-contratos' },
  { id: 'T-002', agent: 'agente-frontend', deps: ['T-001'] },
  { id: 'T-003', agent: 'agente-qa-testes', deps: ['T-002'] },
  { id: 'T-004', agent: 'agente-spec-guardian', deps: ['T-003'] },
];

/** Projeto greenfield com duas specs (a segunda depende da primeira). */
export function greenfieldProject(extra = {}) {
  return tempProject({
    'sdd.config.yaml': stringifyYaml(baseConfig()),
    'specs/features/BIB-100-acervo.md': spec('BIB-100', { title: 'Acervo' }),
    'specs/features/BIB-110-emprestimo.md': spec('BIB-110', { deps: ['BIB-100'], title: 'Empréstimo' }),
    'specs/plans/BIB-100-acervo.md': plan('BIB-100'),
    'specs/tasks/BIB-100-acervo.md': tasks('BIB-100', STANDARD_TASKS),
    'specs/tasks/BIB-110-emprestimo.md': tasks('BIB-110', STANDARD_TASKS),
    ...extra,
  });
}
