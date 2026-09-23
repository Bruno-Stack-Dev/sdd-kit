// Agentes 2.0: mínimo privilégio, auditores somente leitura, contratos de saída/falha, evals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_ROOT } from '../../helpers.mjs';
import { readAgents, validateAgent, AUDITOR_AGENTS, WRITE_TOOLS } from '../../../scripts/lib/doctor/agents-skills.mjs';

const agents = readAgents(KIT_ROOT);
const tools = (a) => String(a.fm.tools ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const denied = (a) => String(a.fm.disallowedTools ?? '').split(',').map((s) => s.trim()).filter(Boolean);
// Nenhum agente do kit precisa de web: documentação atual vem de Context7/MCP sob governança.
const FORBIDDEN_FOR_ALL = ['WebFetch', 'WebSearch', 'Agent', 'Task'];

test('12 agentes, todos com tools explícitas e válidas', () => {
  assert.equal(agents.length, 12);
  const skillNames = { active: new Set(), packs: new Set() };
  for (const a of agents) {
    const v = validateAgent(a, { skillNames });
    assert.deepEqual(v.errors, [], `${a.base}: ${v.errors.join('; ')}`);
    assert.deepEqual(v.warnings, [], `${a.base}: ${v.warnings.join('; ')}`);
    assert.ok(tools(a).length, `${a.base} sem tools`);
    for (const t of FORBIDDEN_FOR_ALL) assert.ok(!tools(a).includes(t), `${a.base} não deveria ter ${t}`);
    assert.notEqual(a.fm.permissionMode, 'bypassPermissions');
  }
});

test('auditores: sem ferramentas de escrita e com disallowedTools explícito', () => {
  for (const a of agents.filter((x) => AUDITOR_AGENTS.has(x.base))) {
    for (const w of WRITE_TOOLS) {
      assert.ok(!tools(a).includes(w), `${a.base} tem ${w}`);
      assert.ok(denied(a).includes(w), `${a.base} deveria negar ${w}`);
    }
  }
  const ux = agents.find((a) => a.base === 'agente-revisor-ux');
  assert.ok(!tools(ux).includes('Bash') && denied(ux).includes('Bash'), 'revisor de UX relata, não executa');
});

test('todo agente tem contrato de saída, contrato de falha e fontes de verdade', () => {
  for (const a of agents) {
    for (const h of ['## Contrato de saída', '## Contrato de falha', '## Fontes de verdade', '## Ferramentas e limites']) {
      assert.ok(a.body.includes(h), `${a.base} sem '${h}'`);
    }
    assert.match(a.body, /vencem.*memória/s, `${a.base}: spec/config/ADR acima da memória`);
  }
});

test('guardião de spec exige evidência por CA, negativa para regra crítica e sdd check forbidden', () => {
  const g = agents.find((a) => a.base === 'agente-spec-guardian').body;
  for (const s of ['Evidência de implementação', 'Evidência de teste positiva', 'Evidência negativa', 'sdd check forbidden', 'Resultado:']) {
    assert.ok(g.includes(s), s);
  }
});

test('cada agente tem ao menos um caso de eval comportamental', () => {
  const ev = JSON.parse(readFileSync(join(KIT_ROOT, 'evals', 'agents', 'agents.json'), 'utf8'));
  const names = readdirSync(join(KIT_ROOT, '.claude', 'agents')).map((f) => f.replace(/\.md$/, ''));
  for (const n of names) {
    assert.ok(Array.isArray(ev.agents[n]) && ev.agents[n].length, `${n} sem evals`);
    for (const c of ev.agents[n]) assert.ok(c.id && c.prompt && c.expected_output, `${n}/${c.id}`);
  }
});
