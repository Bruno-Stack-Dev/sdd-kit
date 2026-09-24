// Modo demo e simulador de eventos. Cria um projeto SINTÉTICO num diretório temporário (nunca no
// projeto do usuário) e grava eventos pelos mesmos escritores do kit — `appendEvent` (validado pelo
// reducer) e `traceEvent` (sanitizado). O dashboard observa a demo exatamente como observa um
// projeto real; o snapshot sai marcado `demo: true` e a UI mostra "DEMO DATA".
//
// Os mesmos passos alimentam os testes de integração (event log → snapshot).
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { stringifyYaml } from '../yaml.mjs';
import { appendEvent, computeState } from '../events.mjs';
import { traceEvent } from '../trace.mjs';
import { loadProject } from '../project.mjs';
import { STATUS_CHECKBOX } from '../specs.mjs';
import { applyProfile } from '../mcp.mjs';
import { ENGINE_ROOT } from '../engine.mjs';

export const DEMO_SESSION = 'demo-session-0001';
export const DEMO_MARK = 'DEMO DATA';

const CONFIG = {
  version: 3,
  project: { name: 'Loja Escola (DEMO)', type: 'SaaS web', domain: 'loja escolar com login Google — dados sintéticos', stage: 'MVP', updated_at: '2026-09-24' },
  stack: { framework: 'Vue 3 + TypeScript', backend: 'Node + Fastify', package_manager: 'npm' },
  commands: { test: 'npm test', e2e: null, typecheck: null },
  paths: { specs: 'specs/', tests: 'tests/' },
  numbering: { prefix: 'DEMO-', increment: 10, start: 'auto' },
  pipelines: {
    backend: [
      { id: 'contrato-api', name: 'Contrato de API', agent: 'agente-arquiteto-contratos' },
      { id: 'servicos', name: 'Serviços', agent: 'agente-backend' },
      { id: 'integracao', name: 'Testes de integração', agent: 'agente-qa-testes' },
      { id: 'conformidade', name: 'Conformidade', agent: 'agente-spec-guardian', guardian: true },
    ],
    frontend: [
      { id: 'store', name: 'Store', agent: 'agente-frontend' },
      { id: 'ui', name: 'UI + rotas + menu', agent: 'agente-frontend' },
      { id: 'testes', name: 'Testes', agent: 'agente-qa-testes' },
      { id: 'guardiao', name: 'Guardião', agent: 'agente-spec-guardian', guardian: true },
    ],
  },
  rules: ['Spec-driven.'],
  forbidden_patterns: [],
  human_gates: [],
  blocked_topics: [],
  engineering_gates: { dependency_audit: { enabled: true, blocking: true, command: 'npm audit --audit-level=high' } },
  integrations: { mcp_profile: 'frontend', packs: [], lsp: { enabled: true } },
};

const spec = (id, title, deps, reqs, extra = '') => [
  '---', `spec-id: ${id}`, `titulo: ${title}`, 'status: rascunho', `cas: ${reqs.filter((r) => r.startsWith('CA')).length}`, `depende-de: [${deps.join(', ')}]`, 'tags: [demo]', '---', '',
  `# ${id}: ${title}`, '', '> Spec sintética do modo demo do dashboard (DEMO DATA).', '', extra, '', '## Requisitos', '',
  ...reqs.filter((r) => /^RN?F/.test(r)).map((r) => `- **${r.split(' ')[0]}**: ${r.split(' ').slice(1).join(' ')}`), '',
  '## Critérios de Aceitação', '', ...reqs.filter((r) => r.startsWith('CA')).map((r) => `- **${r.split(' ')[0]}**: ${r.split(' ').slice(1).join(' ')}`), '',
].join('\n');

const tasksDoc = (id, pipeline, lines) => `---\ntarefas-de: ${id}\nplano-relacionado: ${id}\nstatus: rascunho\npipeline: ${pipeline}\npesos:\n  T-002: 3\n---\n\n# Tarefas\n\n${lines.join('\n')}\n`;

const FILES = {
  'sdd.config.yaml': stringifyYaml(CONFIG),
  'specs/features/DEMO-100-login-google.md': spec('DEMO-100', 'Autenticação Google', [], [
    'RF-01 autenticar com conta Google (OAuth 2.0)', 'RF-02 e-mail único por usuário', 'RNF-01 sessão expira em 30 min',
    'CA-01 login Google cria sessão', 'CA-02 e-mail duplicado é recusado', 'CA-03 usuário desativado não entra', 'CA-04 login gera evento de auditoria',
  ], 'Segue o ADR-001 (OAuth com PKCE).'),
  'specs/features/DEMO-110-tela-login.md': spec('DEMO-110', 'Tela de login', [], ['RF-01 botão "Entrar com Google"', 'CA-01 botão visível na home', 'CA-02 erro de login mostra mensagem', 'CA-03 rota /login está no menu']),
  'specs/plans/DEMO-100.md': '---\nplano-id: DEMO-100\nspec-relacionada: DEMO-100\ntitulo: Plano DEMO-100\nstatus: rascunho\n---\n\n# Plano\n',
  'specs/plans/DEMO-110.md': '---\nplano-id: DEMO-110\nspec-relacionada: DEMO-110\ntitulo: Plano DEMO-110\nstatus: rascunho\n---\n\n# Plano\n',
  'specs/tasks/DEMO-100.md': tasksDoc('DEMO-100', 'backend', [
    '- [ ] [T-001] Contrato de API do OAuth (@agente-arquiteto-contratos)',
    '- [ ] [T-002] Serviço OAuth CA-01 CA-02 CA-03 (@agente-backend) 🔒 T-001',
    '- [ ] [T-003] Testes de integração (@agente-qa-testes) 🔒 T-002',
    '- [ ] [T-004] Conformidade (@agente-spec-guardian) 🔒 T-003',
  ]),
  'specs/tasks/DEMO-110.md': tasksDoc('DEMO-110', 'frontend', [
    '- [ ] [T-001] Store de sessão (@agente-frontend)',
    '- [ ] [T-002] Tela de login CA-01 CA-02 (@agente-frontend) 🔒 T-001',
    '- [ ] [T-003] Testes de componente (@agente-qa-testes) 🔒 T-002',
    '- [ ] [T-004] Guardião (@agente-spec-guardian) 🔒 T-003',
  ]),
  'specs/decisions/ADR-001-oauth-pkce.md': '---\nadr-id: ADR-001\ntitulo: OAuth 2.0 com PKCE\nstatus: aceito\ndata: 2026-09-24\n---\n\n# ADR-001\n',
  'tests/auth.integration.spec.ts': '// DEMO DATA — DEMO-100\ndescribe("DEMO-100", () => {\n  it("CA-01 login Google cria sessão", () => {});\n  it("CA-02 e-mail duplicado é recusado", () => {});\n});\n',
  'tests/login.spec.ts': '// DEMO DATA — DEMO-110\nit("DEMO-110 CA-01 botão visível", () => {});\n',
};

/** Cria o projeto sintético. @returns {string} raiz */
export function createDemoProject(dir = null) {
  const root = dir ?? mkdtempSync(join(tmpdir(), 'sdd-demo-'));
  for (const [rel, content] of Object.entries(FILES)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  mkdirSync(join(root, '.claude'), { recursive: true });
  const settings = join(ENGINE_ROOT, '.claude', 'settings.json');
  if (existsSync(settings)) copyFileSync(settings, join(root, '.claude', 'settings.json'));
  try { applyProfile(root, 'frontend'); } catch { /* demo sem MCP configurado */ }
  writeFileSync(join(root, 'DEMO-DATA.txt'), `${DEMO_MARK}: projeto sintético do \`sdd dashboard --demo\`. Pode ser apagado.\n`);
  return root;
}

export function removeDemoProject(root) {
  if (root && existsSync(join(root, 'DEMO-DATA.txt'))) rmSync(root, { recursive: true, force: true });
}

// ------------------------------------------------------------------------------------------------
// Passos do cenário
// ------------------------------------------------------------------------------------------------

function helpers(root) {
  let graph = null;
  const g = () => (graph ??= loadProject(root).taskGraph);
  const ev = (type, fields = {}) => appendEvent(root, { session: DEMO_SESSION, ...fields, type }, { ctx: { graph: g() } });
  let n = 0;
  const tr = (name, agent, attrs = {}, status = 'ok') => traceEvent(root, { session: DEMO_SESSION, name, status, attrs: { 'sdd.agent': agent, ...attrs } });
  const call = (agent, tool, attrs = {}, { status = 'ok', task } = {}) => {
    const id = `toolu_demo_${++n}`;
    tr('tool.called', agent, { 'tool.name': tool, 'tool.use_id': id, ...attrs });
    const name = ['Write', 'Edit'].includes(tool) ? 'file.modified' : 'tool.completed';
    if (!['Read', 'Grep', 'Glob'].includes(tool)) tr(name, agent, { 'tool.name': tool, 'tool.use_id': id, ...(task ? { 'sdd.task': task, 'sdd.spec': task.split('/')[0] } : {}), ...attrs }, status);
  };
  return { ev, tr, call };
}

const A = { arq: 'agente-arquiteto-contratos', be: 'agente-backend', fe: 'agente-frontend', qa: 'agente-qa-testes', gd: 'agente-spec-guardian' };

/** Passos do cenário, em ordem. Cada passo é pequeno para o dashboard mostrar a evolução. */
export function demoSteps() {
  return [
    ['sessão começa', ({ ev, tr }) => { tr('session.started', null, { 'session.source': 'startup' }); ev('SESSION_STARTED'); }],
    ['specs e tarefas registradas', ({ ev }) => {
      for (const s of ['DEMO-100', 'DEMO-110']) { ev('SPEC_CREATED', { spec: s }); ev('PLAN_CREATED', { spec: s, plan: s }); }
      const t = [['DEMO-100', A.arq], ['DEMO-100', A.be], ['DEMO-100', A.qa], ['DEMO-100', A.gd], ['DEMO-110', A.fe], ['DEMO-110', A.fe], ['DEMO-110', A.qa], ['DEMO-110', A.gd]];
      t.forEach(([s, agent], i) => ev('TASK_CREATED', { task: `${s}/T-00${(i % 4) + 1}`, agent }));
    }],
    ['onda 1: contratos ∥ store', ({ ev, tr }) => {
      ev('TASK_STARTED', { task: 'DEMO-100/T-001', agent: A.arq, meta: { model: 'opus', effort: 'high', wave: 'wave-1' } });
      ev('TASK_STARTED', { task: 'DEMO-110/T-001', agent: A.fe, meta: { model: 'sonnet', effort: 'medium', wave: 'wave-1' } });
      tr('agent.spawned', A.arq, { 'sdd.task': 'DEMO-100/T-001' });
      tr('agent.spawned', A.fe, { 'sdd.task': 'DEMO-110/T-001' });
    }],
    ['arquiteto lê spec e ADR', ({ call }) => { call(A.arq, 'Read', { 'file.path': 'specs/features/DEMO-100-login-google.md' }); call(A.arq, 'Read', { 'file.path': 'specs/decisions/ADR-001-oauth-pkce.md' }); }],
    ['frontend consulta docs via MCP', ({ call }) => { call(A.fe, 'mcp__context7__get-library-docs', { 'mcp.server': 'context7', 'mcp.tool': 'get-library-docs' }, { task: 'DEMO-110/T-001' }); }],
    ['contratos e store escritos', ({ call }) => {
      call(A.arq, 'Write', { 'file.path': 'specs/apis/openapi.yaml' }, { task: 'DEMO-100/T-001' });
      call(A.fe, 'Write', { 'file.path': 'src/stores/session.ts' }, { task: 'DEMO-110/T-001' });
    }],
    ['onda 1 concluída', ({ ev, tr }) => {
      tr('agent.stopped', A.arq); tr('agent.stopped', A.fe);
      ev('TASK_COMPLETED', { task: 'DEMO-100/T-001' }); ev('TASK_COMPLETED', { task: 'DEMO-110/T-001' });
    }],
    ['onda 2: backend ∥ UI', ({ ev, tr }) => {
      ev('TASK_STARTED', { task: 'DEMO-100/T-002', agent: A.be, meta: { model: 'sonnet', effort: 'medium', wave: 'wave-2' } });
      ev('TASK_STARTED', { task: 'DEMO-110/T-002', agent: A.fe, meta: { model: 'sonnet', effort: 'medium', wave: 'wave-2' } });
      tr('agent.spawned', A.be, { 'sdd.task': 'DEMO-100/T-002' });
      tr('agent.spawned', A.fe, { 'sdd.task': 'DEMO-110/T-002' });
    }],
    ['backend usa LSP', ({ call }) => { call(A.be, 'LSP', { 'lsp.operation': 'findReferences', 'file.path': 'src/auth/user.repository.ts' }, { task: 'DEMO-100/T-002' }); call(A.be, 'Read', { 'file.path': 'src/auth/user.repository.ts' }); }],
    ['política bloqueia leitura do .env', ({ tr }) => { tr('policy.decision', A.be, { 'tool.name': 'Read', 'file.path': '.env', 'policy.decision': 'deny', 'policy.rule': 'paths.sensitive' }, 'error'); }],
    ['serviço OAuth e tela escritos', ({ call }) => {
      call(A.be, 'Write', { 'file.path': 'src/auth/oauth.service.ts' }, { task: 'DEMO-100/T-002' });
      call(A.be, 'Write', { 'file.path': 'src/auth/session.service.ts' }, { task: 'DEMO-100/T-002' });
      call(A.fe, 'Write', { 'file.path': 'src/views/Login.vue' }, { task: 'DEMO-110/T-002' });
    }],
    ['teste de integração falha', ({ ev, call }) => {
      call(A.be, 'Bash', { 'tool.command': 'npm test -- auth' }, { status: 'error', task: 'DEMO-100/T-002' });
      ev('TEST_FAILED', { spec: 'DEMO-100', meta: { command: 'npm test -- auth', suite: 'integration', passed: 7, failed: 1, total: 8 } });
      ev('TASK_BLOCKED', { task: 'DEMO-100/T-002', meta: { reason: 'OAuthCallbackTest falhando' } });
    }],
    ['backend corrige e retenta', ({ ev, call }) => {
      ev('TASK_STARTED', { task: 'DEMO-100/T-002', agent: A.be, meta: { model: 'sonnet', effort: 'medium' } });
      call(A.be, 'Edit', { 'file.path': 'src/auth/oauth.service.ts' }, { task: 'DEMO-100/T-002' });
      call(A.be, 'Bash', { 'tool.command': 'npm test -- auth' }, { task: 'DEMO-100/T-002' });
      ev('TEST_PASSED', { spec: 'DEMO-100', meta: { command: 'npm test -- auth', suite: 'integration', passed: 8, failed: 0, total: 8 } });
    }],
    ['onda 2 concluída', ({ ev, tr }) => {
      tr('agent.stopped', A.be); tr('agent.stopped', A.fe);
      ev('TASK_COMPLETED', { task: 'DEMO-100/T-002' }); ev('TASK_COMPLETED', { task: 'DEMO-110/T-002' });
    }],
    ['QA escreve testes de integração', ({ ev, tr, call }) => {
      ev('TASK_STARTED', { task: 'DEMO-100/T-003', agent: A.qa, meta: { model: 'sonnet', effort: 'medium', wave: 'wave-3' } });
      tr('agent.spawned', A.qa, { 'sdd.task': 'DEMO-100/T-003' });
      call(A.qa, 'Write', { 'file.path': 'tests/auth.integration.spec.ts' }, { task: 'DEMO-100/T-003' });
      call(A.qa, 'Bash', { 'tool.command': 'npm test' }, { task: 'DEMO-100/T-003' });
      ev('TEST_PASSED', { spec: 'DEMO-100', meta: { command: 'npm test', suite: 'integration', passed: 12, failed: 0, total: 12, coverage: 84 } });
      ev('TEST_PASSED', { spec: 'DEMO-100', meta: { command: 'npm test', suite: 'unit', passed: 31, failed: 0, total: 31 } });
      tr('agent.stopped', A.qa);
      ev('TASK_COMPLETED', { task: 'DEMO-100/T-003' });
    }],
    ['gate de dependências', ({ ev }) => { ev('GATE_PASSED', { spec: 'DEMO-100', gate: 'dependency_audit', meta: { reason: 'npm audit: 0 high' } }); }],
    ['guardião revisa DEMO-100', ({ ev, tr, call }) => {
      ev('TASK_STARTED', { task: 'DEMO-100/T-004', agent: A.gd, meta: { model: 'opus', effort: 'high', wave: 'wave-4' } });
      tr('agent.spawned', A.gd, { 'sdd.task': 'DEMO-100/T-004' });
      ev('GUARDIAN_STARTED', { spec: 'DEMO-100' });
      call(A.gd, 'Grep', { 'tool.pattern': 'CA-0[1-4]' });
      call(A.gd, 'Read', { 'file.path': 'tests/auth.integration.spec.ts' });
    }],
    ['guardião reprova (CA-04 sem teste)', ({ ev, tr }) => {
      ev('GUARDIAN_REJECTED', { spec: 'DEMO-100', meta: { reason: 'CA-04 (auditoria de login) sem teste' } });
      tr('agent.stopped', A.gd);
    }],
    ['QA e UI em paralelo', ({ ev, tr, call }) => {
      ev('TASK_STARTED', { task: 'DEMO-110/T-003', agent: A.qa, meta: { model: 'sonnet', effort: 'medium', wave: 'wave-5' } });
      tr('agent.spawned', A.qa, { 'sdd.task': 'DEMO-110/T-003' });
      call(A.qa, 'Write', { 'file.path': 'tests/login.spec.ts' }, { task: 'DEMO-110/T-003' });
      call(A.qa, 'mcp__playwright__browser_navigate', { 'mcp.server': 'playwright', 'mcp.tool': 'browser_navigate' }, { task: 'DEMO-110/T-003' });
    }],
    ['testes de componente passam', ({ ev, tr }) => {
      ev('TEST_PASSED', { spec: 'DEMO-110', meta: { command: 'npm test -- login', suite: 'unit', passed: 9, failed: 0, total: 9 } });
      tr('agent.stopped', A.qa);
      ev('TASK_COMPLETED', { task: 'DEMO-110/T-003' });
    }],
    ['guardião aprova DEMO-100', ({ ev, tr }) => {
      tr('agent.spawned', A.gd, { 'sdd.task': 'DEMO-100/T-004' });
      ev('GUARDIAN_STARTED', { spec: 'DEMO-100' });
      ev('GUARDIAN_APPROVED', { spec: 'DEMO-100', meta: { evidence: ['.sdd/reports/guardian-DEMO-100.md', 'npm test: 43/43'] } });
      tr('agent.stopped', A.gd);
      ev('TASK_COMPLETED', { task: 'DEMO-100/T-004' });
      ev('SPEC_IMPLEMENTED', { spec: 'DEMO-100' });
    }],
    ['guardião revisa DEMO-110', ({ ev, tr }) => {
      ev('TASK_STARTED', { task: 'DEMO-110/T-004', agent: A.gd, meta: { model: 'opus', effort: 'high', wave: 'wave-6' } });
      tr('agent.spawned', A.gd, { 'sdd.task': 'DEMO-110/T-004' });
      ev('GUARDIAN_STARTED', { spec: 'DEMO-110' });
    }],
    ['entrega pronta', ({ ev, tr }) => {
      ev('GATE_PASSED', { spec: 'DEMO-110', gate: 'dependency_audit', meta: { reason: 'npm audit: 0 high' } });
      ev('GUARDIAN_APPROVED', { spec: 'DEMO-110', meta: { evidence: '.sdd/reports/guardian-DEMO-110.md' } });
      tr('agent.stopped', A.gd);
      ev('TASK_COMPLETED', { task: 'DEMO-110/T-004' });
      ev('SPEC_IMPLEMENTED', { spec: 'DEMO-110' });
    }],
  ].map(([label, run]) => ({ label, run }));
}

/** Reescreve os checkboxes a partir do estado, como `sdd tasks sync` faz no fluxo real. */
function syncCheckboxes(root) {
  const { state } = computeState(root);
  for (const id of ['DEMO-100', 'DEMO-110']) {
    const f = join(root, 'specs', 'tasks', `${id}.md`);
    const text = readFileSync(f, 'utf8').replace(/^- \[.\] \[(T-\d{3})\]/gm, (m, t) => `- [${STATUS_CHECKBOX[state.tasks[`${id}/${t}`]?.status] ?? ' '}] [${t}]`);
    writeFileSync(f, text);
  }
}

/** Executa os passos [from, to) em sequência (síncrono). @returns número de passos executados */
export function runDemoSteps(root, { from = 0, to = Infinity } = {}) {
  const steps = demoSteps();
  const h = helpers(root);
  let n = 0;
  for (let i = from; i < Math.min(to, steps.length); i++) { steps[i].run(h); n++; }
  if (n) syncCheckboxes(root);
  return n;
}

/** Simulação ao vivo: um passo a cada `intervalMs`. @returns {{ stop: () => void, total: number }} */
export function startDemo(root, { intervalMs = 900, onStep = () => {} } = {}) {
  const steps = demoSteps();
  const h = helpers(root);
  let i = 0;
  const timer = setInterval(() => {
    if (i >= steps.length) { clearInterval(timer); onStep({ index: i, total: steps.length, label: 'simulação concluída', done: true }); return; }
    try { steps[i].run(h); syncCheckboxes(root); } catch (e) { onStep({ index: i, total: steps.length, label: `falhou: ${e.message}`, done: false, error: true }); }
    i++;
    onStep({ index: i, total: steps.length, label: steps[i - 1].label, done: false });
  }, intervalMs);
  return { stop: () => clearInterval(timer), total: steps.length };
}

export function isDemoRoot(root) {
  try { return readFileSync(join(root, 'DEMO-DATA.txt'), 'utf8').startsWith(DEMO_MARK); } catch { return false; }
}
