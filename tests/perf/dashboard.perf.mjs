#!/usr/bin/env node
// Desempenho do dashboard num projeto sintético grande (fora do `npm test`: roda à mão ou no release).
//
//   node tests/perf/dashboard.perf.mjs [--report docs/reports/dashboard-performance.md] [--events 100000]
//
// Cenário: 50 agentes, 100 specs × 10 tarefas (1 000), 50 ADRs, ~100 000 eventos (domínio + trace).
// Mede: startup (serviço + primeiro snapshot), memória, atualização incremental (1 000 registros novos),
// CPU ociosa com o watcher ligado e o tempo de desenho de um quadro da TUI.
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir, cpus, platform, release } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { stringifyYaml } from '../../scripts/lib/yaml.mjs';
import { baseConfig } from '../fixtures/project.mjs';
import { createDashboardService } from '../../scripts/lib/dashboard/index.mjs';
import { renderOnce } from '../../scripts/lib/dashboard/tui/app.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const TOTAL_EVENTS = Number(flag('events', 100_000));
const REPORT = flag('report', null);
const KIT = fileURLToPath(new URL('../..', import.meta.url));

const root = mkdtempSync(join(tmpdir(), 'sdd-perf-'));
const w = (rel, content) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const AGENTS = Array.from({ length: 50 }, (_, i) => `agente-perf-${String(i).padStart(2, '0')}`);

console.log(`gerando projeto sintético em ${root} …`);
w('sdd.config.yaml', stringifyYaml(baseConfig({ numbering: { prefix: 'PRF-', increment: 10, start: 'auto' } })));
for (const a of AGENTS) w(`.claude/agents/${a}.md`, `---\nname: ${a}\ndescription: agente sintético de desempenho\ntools: Read, Grep, Edit, Write, Bash\nmodel: sonnet\n---\n\n# ${a}\n`);
for (let i = 0; i < 50; i++) w(`specs/decisions/ADR-${String(i + 1).padStart(3, '0')}-perf.md`, `---\nadr-id: ADR-${String(i + 1).padStart(3, '0')}\ntitulo: Decisão ${i}\nstatus: aceito\n---\n`);
const specs = Array.from({ length: 100 }, (_, i) => `PRF-${100 + i * 10}`);
const domain = [];
let ms = Date.UTC(2026, 8, 1);
const ev = (type, f = {}) => domain.push(JSON.stringify({ v: 1, id: randomUUID(), ts: new Date(ms += 1000).toISOString(), type, session: 'perf-1', ...f }));
specs.forEach((id, si) => {
  w(`specs/features/${id}.md`, `---\nspec-id: ${id}\ntitulo: Spec ${si}\nstatus: rascunho\ncas: 3\ndepende-de: []\n---\n\nVer ADR-${String((si % 50) + 1).padStart(3, '0')}.\n\n- **RF-01**: requisito\n- **CA-01**: a\n- **CA-02**: b\n- **CA-03**: c\n`);
  w(`specs/plans/${id}.md`, `---\nplano-id: ${id}\nspec-relacionada: ${id}\ntitulo: Plano\nstatus: rascunho\n---\n`);
  const lines = Array.from({ length: 10 }, (_, t) => `- [ ] [T-${String(t + 1).padStart(3, '0')}] tarefa ${t} CA-0${(t % 3) + 1} (@${AGENTS[(si + t) % 50]})${t ? ` 🔒 T-${String(t).padStart(3, '0')}` : ''}`);
  w(`specs/tasks/${id}.md`, `---\ntarefas-de: ${id}\nplano-relacionado: ${id}\nstatus: rascunho\n---\n\n${lines.join('\n')}\n`);
  ev('SPEC_CREATED', { spec: id });
  ev('PLAN_CREATED', { spec: id, plan: id });
  for (let t = 0; t < 10; t++) ev('TASK_CREATED', { task: `${id}/T-${String(t + 1).padStart(3, '0')}`, spec: id, agent: AGENTS[(si + t) % 50] });
  const done = si % 10;
  for (let t = 0; t < done; t++) {
    const task = `${id}/T-${String(t + 1).padStart(3, '0')}`;
    ev('TASK_STARTED', { task, spec: id, agent: AGENTS[(si + t) % 50] });
    ev('TASK_COMPLETED', { task, spec: id });
  }
  ev('TEST_PASSED', { spec: id, meta: { suite: 'unit', passed: 40, failed: 0, total: 40 } });
});
w('.sdd/events.jsonl', `${domain.join('\n')}\n`);
const traceCount = Math.max(0, TOTAL_EVENTS - domain.length);
const tools = ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'mcp__context7__get-library-docs', 'LSP'];
for (let s = 0; s < 10; s++) {
  const lines = [];
  for (let i = 0; i < traceCount / 10; i++) {
    const tool = tools[i % tools.length];
    const agent = AGENTS[(i + s) % 50];
    const id = `toolu_${s}_${i}`;
    const ts = new Date(ms += 20).toISOString();
    lines.push(JSON.stringify({ v: 1, ts, trace_id: 'a'.repeat(32), span_id: `${s}${i}`, name: i % 2 ? 'tool.completed' : 'tool.called', session: `perf-${s}`, status: i % 97 ? 'ok' : 'error', attrs: { 'sdd.agent': agent, 'tool.name': tool, 'tool.use_id': id, 'file.path': `src/m${i % 400}.ts` } }));
  }
  w(`.sdd/trace/perf-${s}.jsonl`, `${lines.join('\n')}\n`);
}
const total = domain.length + traceCount;
console.log(`${AGENTS.length} agentes · ${specs.length} specs · ${specs.length * 10} tarefas · 50 ADRs · ${total} eventos (${domain.length} de domínio)`);

const mem0 = process.memoryUsage();
let t0 = performance.now();
const svc = createDashboardService(root, { scan: false });
const snap = svc.getSnapshot();
const startupMs = performance.now() - t0;
const mem1 = process.memoryUsage();

t0 = performance.now();
const frame = renderOnce(snap, { width: 140, height: 50 });
const frameMs = performance.now() - t0;

const more = [];
for (let i = 0; i < 1000; i++) more.push(JSON.stringify({ v: 1, ts: new Date(ms += 10).toISOString(), span_id: `n${i}`, name: 'tool.completed', session: 'perf-0', status: 'ok', attrs: { 'sdd.agent': AGENTS[i % 50], 'tool.name': 'Bash' } }));
appendFileSync(join(root, '.sdd', 'trace', 'perf-0.jsonl'), `${more.join('\n')}\n`);
t0 = performance.now();
svc.poll();
const snap2 = svc.getSnapshot();
const updateMs = performance.now() - t0;

const cpu0 = process.cpuUsage();
const idle0 = performance.now();
const stop = svc.watch(() => {});
await new Promise((r) => setTimeout(r, 5000));
stop();
const cpu = process.cpuUsage(cpu0);
const idleMs = performance.now() - idle0;
const cpuPct = ((cpu.user + cpu.system) / 1000 / idleMs) * 100;

const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const rows = [
  ['Startup (serviço + 1º snapshot)', `${startupMs.toFixed(0)} ms`],
  ['Heap usado após o snapshot', `${mb(mem1.heapUsed)} (Δ ${mb(mem1.heapUsed - mem0.heapUsed)})`],
  ['RSS após o snapshot', mb(mem1.rss)],
  ['Atualização incremental (+1 000 registros) + snapshot', `${updateMs.toFixed(0)} ms`],
  ['Quadro da TUI (140×50)', `${frameMs.toFixed(1)} ms`],
  ['CPU ociosa com watcher (5 s)', `${cpuPct.toFixed(2)}%`],
  ['Eventos observados', String(snap2.events.total)],
  ['Janela em memória (events.max_displayed)', String(snap2.events.recent.length)],
];
for (const [k, v] of rows) console.log(`${k.padEnd(52)} ${v}`);
if (!frame.includes('SDD KIT')) throw new Error('quadro inválido');
rmSync(root, { recursive: true, force: true });

if (REPORT) {
  const md = [
    '# Desempenho do dashboard (`sdd status` / `sdd dashboard`)',
    '',
    `Gerado por \`node tests/perf/dashboard.perf.mjs --report ${REPORT}\` em ${new Date().toISOString().slice(0, 10)}.`,
    '',
    `Ambiente: Node ${process.version} · ${platform()} ${release()} · ${cpus()[0]?.model ?? '?'} (${cpus().length} núcleos).`,
    '',
    `Cenário sintético: ${AGENTS.length} agentes, ${specs.length} specs, ${specs.length * 10} tarefas, 50 ADRs, ${total} eventos`,
    `(${domain.length} de domínio em \`.sdd/events.jsonl\`, ${traceCount} de trace em 10 sessões). Scans de segurança desligados`,
    '(`--no-scan`): o secret scan custa o mesmo que `doctor --security` e roda só no startup e no `r`.',
    '',
    '| Medida | Resultado |',
    '|--------|-----------|',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '## Leitura',
    '',
    '- O startup lê os dois logs uma vez (streaming por offset) e aplica o reducer incremental; depois',
    '  disso cada atualização só processa os bytes novos (`JsonlTail`), sem reler o log inteiro.',
    '- A memória fica limitada: a janela de eventos (`events.max_displayed`), a linha do tempo por',
    '  agente (100) e a tabela de arquivos (5 000) são buffers fixos; o resto são contadores.',
    '- Ocioso, o dashboard só faz `stat` periódico (padrão 1 s) além do `fs.watch`; o custo de CPU',
    '  medido acima inclui esse stat e o timer do relógio.',
    '',
  ].join('\n');
  writeFileSync(join(KIT, REPORT), md);
  console.log(`relatório: ${REPORT}`);
}
