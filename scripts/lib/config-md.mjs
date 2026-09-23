// Conversão entre a config legada em Markdown (sdd.config.md, 12 seções) e o objeto da config v3.
//
//   parseLegacyConfigMd(text) → objeto v3   (usado por `sdd config migrate` e pela leitura de legado)
//   renderConfigMd(config)     → Markdown    (visão gerada por `sdd config render`)
//
// Propriedade testada: parseLegacyConfigMd(renderConfigMd(cfg)) é igual a cfg (round-trip), e toda
// informação de um .md legado que não tem campo próprio vai para `legacy` (nada é descartado).
import { parseYaml, stringifyYaml } from './yaml.mjs';

export const GENERATED_MARKER = 'AUTO-GENERATED — DO NOT EDIT DIRECTLY';

// ------------------------------------------------------------------------------------------------
// Rótulos conhecidos (tabelas da visão Markdown) ↔ chaves da config
// ------------------------------------------------------------------------------------------------

const PROJECT_LABELS = { name: 'Nome', type: 'Tipo', domain: 'Domínio em uma frase', stage: 'Estágio' };
const STACK_LABELS = {
  framework: 'Linguagem/framework principal',
  ui_library: 'Biblioteca de UI',
  state: 'Estado',
  package_manager: 'Gerenciador de pacotes',
};
const COMMAND_LABELS = {
  test: 'Comando de testes (unit/componente)',
  e2e: 'Comando de testes e2e',
  typecheck: 'Comando de typecheck/lint',
  lint: 'Comando de lint',
  build: 'Comando de build',
};
const PATH_LABELS = {
  specs: 'Specs',
  contracts: 'Contratos/tipos compartilhados',
  module: 'Módulo de domínio',
  mocks: 'Mocks',
  stores: 'Stores',
  views: 'Views/telas',
  routes: 'Rotas',
  navigation: 'Registro de navegação (menu)',
  tests: 'Testes (colocação)',
  e2e: 'Testes e2e',
};
const BACKEND_PATH_LABELS = {
  root: 'Raiz do backend',
  handlers: 'Handlers/controllers (borda)',
  services: 'Serviços (regra de negócio)',
  repositories: 'Repositórios (acesso a dados)',
  migrations: 'Migrations',
  openapi: 'Contrato de API (OpenAPI)',
  integration_tests: 'Testes de integração',
};
const DEFAULT_LABELS = {
  multi_tenant: 'Multi-tenant/escopo',
  sensitive_data: 'Dados sensíveis/LGPD',
  non_goals: 'Não-objetivos',
  technical_constraints: 'Restrições técnicas',
};
const GATE_LABELS = {
  coverage: 'Cobertura mínima de testes',
  dependency_audit: 'Auditoria de dependências',
  security_lint: 'Lint de segurança',
  reversible_migrations: 'Migrations reversíveis',
  contract_conformance: 'Conformidade de contrato (API)',
};
const DS_SECTION_LABELS = {
  identity: 'Identidade do DS',
  severity: 'Calibração de severidade',
  release_gates: 'Portões de release do DS',
  integrations: 'Integrações',
  reports: 'Relatórios recorrentes',
};
// Seções 5 / 5-B / 5-C do formato v2 viram pipelines com estes nomes.
const LEGACY_PIPELINES = { '5': 'frontend', '5-B': 'backend', '5-C': 'delivery' };

const invert = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [norm(v), k]));

// ------------------------------------------------------------------------------------------------
// Utilitários de texto
// ------------------------------------------------------------------------------------------------

function norm(s) {
  return String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function slugId(s) {
  return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function slugKey(s) {
  return norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
}

export function isPlaceholder(v) {
  if (typeof v !== 'string') return false;
  const s = v.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
  return /<TODO>/i.test(s) || /<[^>\n]*ex\.?:/i.test(s) || /^\s*<TODO/i.test(v) || /^<ex\.?:/i.test(v.trim());
}

function stripBold(s) {
  return s.replace(/^\*\*(.*)\*\*$/, '$1').trim();
}

const NA = new Set(['n/a', 'na', '—', '-', '']);

/** Célula de texto livre: tira negrito e o sufixo de template " · ou `n/a`". */
function textCell(raw) {
  let v = stripBold(raw.trim()).replace(/\s*·\s*ou\s*`?n\/a`?\s*$/i, '').trim();
  if (NA.has(v.toLowerCase()) || v === '`n/a`') return null;
  return v;
}

/** Célula "de código": conteúdo do primeiro span de código (se houver e não for placeholder). */
function codeCell(raw) {
  const v = textCell(raw);
  if (v === null) return null;
  if (isPlaceholder(v)) return v;
  const dbl = v.match(/``\s?(.+?)\s?``/);
  if (dbl) return NA.has(dbl[1].toLowerCase()) ? null : dbl[1];
  const m = v.match(/`([^`]*)`/);
  if (m) return NA.has(m[1].toLowerCase()) ? null : m[1];
  return v;
}

function code(v) {
  if (v === null || v === undefined) return 'n/a';
  const s = String(v);
  if (isPlaceholder(s)) return escapeCell(s);
  const wrapped = s.includes('`') ? `\`\` ${s} \`\`` : `\`${s}\``;
  return escapeCell(wrapped);
}

function text(v) {
  if (v === null || v === undefined) return 'n/a';
  return escapeCell(String(v).replace(/\r?\n/g, ' '));
}

function escapeCell(s) {
  return s.replace(/\|/g, '\\|');
}

function labelKey(label, known) {
  const clean = stripBold(label.trim());
  const k = known[norm(clean)];
  if (k) return k;
  const m = clean.match(/^`([^`]+)`$/);
  if (m) return m[1];
  return slugKey(clean);
}

function keyLabel(key, labels) {
  return labels[key] ?? `\`${key}\``;
}

// ------------------------------------------------------------------------------------------------
// Parse de Markdown (seções, tabelas, listas)
// ------------------------------------------------------------------------------------------------

function splitCells(line) {
  const cells = [];
  let cur = '';
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

/** Todas as tabelas de um bloco de Markdown: [{ header: [...], rows: [[...]] }]. */
function tables(body) {
  const out = [];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) continue;
    const header = splitCells(lines[i]);
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && /^\s*\|/.test(lines[j]); j++) rows.push(splitCells(lines[j]));
    out.push({ header, rows });
    i = j - 1;
  }
  return out;
}

function bullets(body) {
  const out = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s+\*\*(.+?):\*\*\s*(.*)$/);
    if (m) out.push([m[1].trim(), m[2].trim()]);
  }
  return out;
}

function plainBullets(body) {
  return body.split(/\r?\n/).map((l) => l.match(/^\s*-\s+(.*)$/)).filter(Boolean).map((m) => m[1].trim());
}

function numberedList(body) {
  return body.split(/\r?\n/).map((l) => l.match(/^\s*\d+\.\s+(.*)$/)).filter(Boolean).map((m) => m[1].trim());
}

/** Divide o documento em seções `## N. Título` (e subseções `### ...`). */
function sections(md) {
  const out = { preamble: '', list: [] };
  let cur = null;
  for (const line of md.split(/\r?\n/)) {
    const h2 = line.match(/^##\s+(\d+)\.\s*(.*)$/);
    const h2other = !h2 && line.match(/^##\s+(.*)$/);
    if (h2 || h2other) {
      cur = { num: h2 ? h2[1] : null, title: (h2 ? h2[2] : h2other[1]).trim(), body: '', subs: [] };
      out.list.push(cur);
      continue;
    }
    if (!cur) { out.preamble += line + '\n'; continue; }
    const h3 = line.match(/^###\s+(.*)$/);
    if (h3) { cur.subs.push({ title: h3[1].trim(), body: '' }); continue; }
    if (cur.subs.length) cur.subs[cur.subs.length - 1].body += line + '\n';
    else cur.body += line + '\n';
  }
  return out;
}

function frontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z0-9-]+):\s*(.*)$/i);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return fm;
}

function saysNone(body) {
  return /\b(nenhum|nenhuma|n\/a)\b/i.test(body.replace(/`[^`]*`/g, ''));
}

// ------------------------------------------------------------------------------------------------
// Markdown legado → objeto v3
// ------------------------------------------------------------------------------------------------

export function parseLegacyConfigMd(md) {
  const fm = frontmatter(md);
  const secs = sections(md);
  const cfg = {
    version: 3,
    project: { name: null, type: null, domain: null, stage: null, updated_at: null },
    stack: {},
    commands: {},
    paths: {},
    numbering: { prefix: null, increment: 10, start: 'auto' },
    pipelines: {},
    rules: [],
    forbidden_patterns: [],
    human_gates: [],
    blocked_topics: [],
    defaults: {},
    engineering_gates: {},
  };
  const legacySections = {};
  const pInv = invert(PROJECT_LABELS);

  for (const sec of secs.list) {
    const all = sec.body + sec.subs.map((s) => `### ${s.title}\n${s.body}`).join('\n');
    switch (sec.num) {
      case '1': {
        for (const [label, value] of bullets(sec.body)) {
          const k = pInv[norm(label)];
          if (k) cfg.project[k] = textCell(value);
          else (cfg.project_extra ??= {})[slugKey(label)] = textCell(value);
        }
        break;
      }
      case '2': {
        const sInv = invert(STACK_LABELS);
        const cInv = invert(COMMAND_LABELS);
        for (const t of tables(sec.body)) {
          for (const row of t.rows) {
            const label = stripBold(row[0] ?? '');
            const n = norm(label);
            const cmdExtra = label.match(/^Comando `([^`]+)`$/);
            if (cInv[n]) cfg.commands[cInv[n]] = codeCell(row[1] ?? '');
            else if (cmdExtra) cfg.commands[cmdExtra[1]] = codeCell(row[1] ?? '');
            else cfg.stack[sInv[n] ?? labelKey(label, {})] = textCell(row[1] ?? '');
          }
        }
        break;
      }
      case '3': {
        const inv = invert(PATH_LABELS);
        for (const t of tables(sec.body)) {
          for (const row of t.rows) cfg.paths[labelKey(row[0], inv)] = codeCell(row[1] ?? '');
        }
        for (const sub of sec.subs) {
          if (!/3-B|backend/i.test(sub.title)) continue;
          const binv = invert(BACKEND_PATH_LABELS);
          const backend = {};
          for (const t of tables(sub.body)) {
            for (const row of t.rows) backend[labelKey(row[0], binv)] = codeCell(row[1] ?? '');
          }
          cfg.paths.backend = backend;
        }
        break;
      }
      case '4': {
        for (const [label, value] of bullets(sec.body)) {
          const n = norm(label);
          if (n.startsWith('prefixo')) cfg.numbering.prefix = codeCell(value.split(/\s·\s/)[0]);
          else if (n.startsWith('incremento')) {
            const d = value.match(/(\d+)/);
            cfg.numbering.increment = d ? Number(d[1]) : cfg.numbering.increment;
          } else if (n.startsWith('bloco inicial')) {
            const d = value.replace(/`/g, '').trim().match(/^(\d+)/);
            cfg.numbering.start = d ? Number(d[1]) : 'auto';
          }
        }
        break;
      }
      case '5': {
        const addPipeline = (name, t) => {
          const idIdx = t.header.findIndex((h) => norm(h) === 'id');
          const col = (names) => t.header.findIndex((h) => names.includes(norm(h)));
          const iName = col(['camada', 'etapa']);
          const iAgent = col(['agente']);
          const iOut = col(['saida esperada', 'saida']);
          const iWhen = col(['quando']);
          const iGuard = col(['guardiao', 'guardiao?']);
          const used = new Set();
          const steps = [];
          for (const row of t.rows) {
            const nameCell = textCell(row[iName] ?? '') ?? `etapa-${steps.length + 1}`;
            let id = idIdx >= 0 ? codeCell(row[idIdx]) : slugId(nameCell);
            let k = 2;
            const base = id;
            while (used.has(id)) id = `${base}-${k++}`;
            used.add(id);
            const agent = (codeCell(row[iAgent] ?? '') ?? '').replace(/^@/, '');
            const step = { id, name: nameCell, agent };
            const output = iOut >= 0 ? textCell(row[iOut] ?? '') : null;
            if (output !== null) step.output = output;
            const when = iWhen >= 0 ? textCell(row[iWhen] ?? '') : null;
            if (when !== null) step.when = when;
            const guardian = iGuard >= 0 ? /^(sim|true|yes|x)$/i.test(textCell(row[iGuard] ?? '') ?? '') : /-guardian$/.test(agent);
            if (guardian) step.guardian = true;
            steps.push(step);
          }
          if (steps.length) cfg.pipelines[name] = steps;
        };
        const main = tables(sec.body)[0];
        if (main) addPipeline(LEGACY_PIPELINES['5'], main);
        for (const sub of sec.subs) {
          const t = tables(sub.body)[0];
          if (!t) continue;
          const named = sub.title.match(/^Pipeline\s+`([^`]+)`/i);
          const legacy = sub.title.match(/^(5-[A-Z])\b/);
          if (named) addPipeline(named[1], t);
          else if (legacy && LEGACY_PIPELINES[legacy[1]]) addPipeline(LEGACY_PIPELINES[legacy[1]], t);
          else addPipeline(slugId(sub.title), t);
        }
        // Formato v3 renderizado: todas as pipelines em subseções nomeadas (sem tabela principal).
        break;
      }
      case '6':
        cfg.rules = numberedList(sec.body);
        break;
      case '7': {
        const t = tables(sec.body)[0];
        const rows = t ? t.rows.filter((r) => r.some((c) => c.trim())) : [];
        cfg.forbidden_patterns = rows.map((r) => {
          const fp = { pattern: codeCell(r[0] ?? ''), scope: codeCell(r[1] ?? '') };
          const exp = Number(String(r[2] ?? '0').replace(/[^\d]/g, ''));
          fp.expected = Number.isFinite(exp) ? exp : 0;
          if (r[3] !== undefined && textCell(r[3]) !== null) fp.reason = textCell(r[3]);
          return fp;
        });
        break;
      }
      case '8': {
        const t = tables(sec.body)[0];
        const rows = t ? t.rows.filter((r) => r.some((c) => c.trim())) : [];
        cfg.human_gates = rows.map((r) => ({
          decision: textCell(r[0] ?? ''),
          entity: textCell(r[1] ?? ''),
          setter: codeCell(r[2] ?? ''),
          invariant: textCell(r[3] ?? ''),
        }));
        break;
      }
      case '9':
        cfg.blocked_topics = plainBullets(sec.body).filter((b) => !/^(nenhum|nenhuma|n\/a)\.?$/i.test(b.replace(/[<>]/g, '').trim()));
        break;
      case '10': {
        const inv = invert(DEFAULT_LABELS);
        for (const t of tables(sec.body)) for (const row of t.rows) cfg.defaults[labelKey(row[0], inv)] = textCell(row[1] ?? '');
        break;
      }
      case '11': {
        const inv = invert(GATE_LABELS);
        const t = tables(sec.body)[0];
        if (t) {
          const col = (names) => t.header.findIndex((h) => names.some((n) => norm(h).startsWith(n)));
          const iOn = col(['ativar']);
          const iBlock = col(['bloqueia']);
          const iCmd = col(['comando', 'como']);
          const iThr = col(['limite']);
          for (const row of t.rows) {
            const key = labelKey(row[0], inv);
            const on = textCell(row[iOn] ?? '') ?? '';
            const gate = { enabled: !isPlaceholder(on) && /^(`?true`?|sim|yes|on)$/i.test(on) };
            const raw = (i) => (i >= 0 ? (row[i] ?? '').trim() : '');
            if (iBlock >= 0 && raw(iBlock) !== '') gate.blocking = /^(`?true`?|sim|yes)$/i.test(textCell(raw(iBlock)) ?? '');
            if (iCmd >= 0 && raw(iCmd) !== '') gate.command = codeCell(raw(iCmd));
            if (iThr >= 0 && raw(iThr) !== '') {
              const thr = textCell(raw(iThr));
              gate.threshold = thr !== null && /^-?\d+(\.\d+)?$/.test(thr) ? Number(thr) : thr;
            }
            cfg.engineering_gates[key] = gate;
          }
        }
        break;
      }
      case '12': {
        const ds = {};
        const inv = invert(DS_SECTION_LABELS);
        for (const sub of sec.subs) {
          const title = sub.title.replace(/^12\.\d+\s*/, '').replace(/\s*\(.*\)\s*$/, '').trim();
          const key = inv[norm(title)] ?? labelKey(title, {});
          const t = tables(sub.body)[0];
          if (!t) continue;
          const obj = {};
          for (const row of t.rows) {
            const rowKey = labelKey(row[0], {});
            if (t.header.length <= 2) obj[rowKey] = textCell(row[1] ?? '');
            else {
              const inner = {};
              t.header.slice(1).forEach((h, i) => { inner[labelKey(h, {})] = textCell(row[i + 1] ?? ''); });
              obj[rowKey] = inner;
            }
          }
          ds[key] = obj;
        }
        if (Object.keys(ds).length) cfg.design_system = ds;
        break;
      }
      case '13': {
        // Uma seção 13 livre de um projeto v2 (sem ser o bloco de extensões) é preservada como legado.
        if (!/extens/i.test(sec.title)) { legacySections[`${sec.num}. ${sec.title}`] = all.trim(); break; }
        // Extensões v3 renderizadas como bloco YAML (segurança, integrações, agentes, IA, legado...).
        const m = all.match(/```ya?ml\r?\n([\s\S]*?)```/);
        if (m) {
          const ext = parseYaml(m[1]) ?? {};
          for (const [k, v] of Object.entries(ext)) {
            // Mescla por chave: o bloco v3 completa/sobrescreve só as entradas que a tabela não
            // conseguiu representar (ex.: portões com campos extras, stack com sub-objetos).
            const mergeable = ['stack', 'commands', 'paths', 'engineering_gates', 'design_system'];
            if (mergeable.includes(k) && v && typeof v === 'object') cfg[k] = { ...(cfg[k] ?? {}), ...v };
            else cfg[k] = v;
          }
        }
        break;
      }
      default:
        legacySections[sec.num ? `${sec.num}. ${sec.title}` : sec.title] = all.trim();
    }
  }

  if (!cfg.project.name && fm.projeto) cfg.project.name = fm.projeto;
  if (!cfg.project.updated_at && fm['atualizado-em']) cfg.project.updated_at = fm['atualizado-em'];
  if (!cfg.paths.specs) cfg.paths.specs = 'specs/';
  if (cfg.project_extra) {
    (cfg.legacy ??= {}).project_extra = cfg.project_extra;
    delete cfg.project_extra;
  }
  if (Object.keys(legacySections).length) (cfg.legacy ??= {}).sections = { ...(cfg.legacy?.sections ?? {}), ...legacySections };
  if (!Object.keys(cfg.stack).length) delete cfg.stack;
  if (!Object.keys(cfg.defaults).length) delete cfg.defaults;
  if (!Object.keys(cfg.engineering_gates).length) delete cfg.engineering_gates;
  return cfg;
}

// ------------------------------------------------------------------------------------------------
// Objeto v3 → Markdown (visão gerada)
// ------------------------------------------------------------------------------------------------

function table(header, rows) {
  const out = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
  for (const r of rows) out.push(`| ${r.join(' | ')} |`);
  return out.join('\n');
}

export function renderConfigMd(cfg, { source = 'sdd.config.yaml' } = {}) {
  const p = cfg.project ?? {};
  const L = [];
  L.push('---');
  L.push('sdd-config-version: 3');
  L.push(`projeto: ${p.name ?? ''}`);
  L.push(`atualizado-em: ${p.updated_at ?? ''}`);
  L.push(`gerado-de: ${source}`);
  L.push('---');
  L.push('');
  L.push(`<!-- ${GENERATED_MARKER}. Fonte canônica: ${source}. Regenerar: node scripts/sdd.mjs config render -->`);
  L.push('');
  L.push('# sdd.config — Configuração do projeto para o SDD Kit');
  L.push('');
  L.push(`> **Visão gerada.** A fonte da verdade é \`${source}\` (validada por`);
  L.push('> `schemas/sdd-config.schema.json`). Edite o YAML e rode `node scripts/sdd.mjs config render`.');
  L.push('> Agentes podem ler esta visão; as seções mantêm a numeração do formato v2.');
  L.push('');

  L.push('## 1. Identidade', '');
  for (const k of Object.keys(PROJECT_LABELS)) L.push(`- **${PROJECT_LABELS[k]}:** ${p[k] ?? 'n/a'}`);
  L.push('');

  L.push('## 2. Stack e comandos', '');
  const rows2 = [];
  const ext = {};
  for (const [k, v] of Object.entries(cfg.stack ?? {})) {
    if (v !== null && typeof v === 'object') { (ext.stack ??= {})[k] = v; continue; }
    rows2.push([keyLabel(k, STACK_LABELS), text(v)]);
  }
  for (const [k, v] of Object.entries(cfg.commands ?? {})) {
    rows2.push([`**${COMMAND_LABELS[k] ?? `Comando \`${k}\``}**`, code(v)]);
  }
  L.push(table(['Item', 'Valor neste projeto'], rows2), '');
  L.push('> O motor roda exatamente estes comandos na validação. `n/a` = não se aplica.', '');

  L.push('## 3. Estrutura de pastas (paths)', '');
  const rows3 = [];
  for (const [k, v] of Object.entries(cfg.paths ?? {})) {
    if (k === 'backend') continue;
    rows3.push([keyLabel(k, PATH_LABELS), code(v)]);
  }
  L.push(table(['Artefato', 'Caminho neste projeto'], rows3), '');
  if (cfg.paths?.backend) {
    L.push('### 3-B. Paths de backend', '');
    const rowsB = Object.entries(cfg.paths.backend).map(([k, v]) => [keyLabel(k, BACKEND_PATH_LABELS), code(v)]);
    L.push(table(['Artefato', 'Caminho neste projeto'], rowsB), '');
  }

  const n = cfg.numbering ?? {};
  L.push('## 4. Numeração de specs', '');
  L.push(`- **Prefixo:** ${code(n.prefix)} · espelhado em \`PLAN-\` / \`TASKS-\`.`);
  L.push(`- **Incremento por submódulo:** \`+${n.increment ?? 10}\``);
  L.push(`- **Bloco inicial:** ${n.start === undefined || n.start === 'auto' ? 'auto — próximo bloco de centena livre (`sdd spec new`)' : `\`${n.start}\``}`);
  L.push('');

  L.push('## 5. Camadas de implementação (pipelines)', '');
  L.push('A ordem que o motor segue, uma etapa por vez até o verde. `sdd spec new` gera as tarefas a partir destas etapas.', '');
  for (const [name, steps] of Object.entries(cfg.pipelines ?? {})) {
    L.push(`### Pipeline \`${name}\``, '');
    const rows5 = steps.map((s, i) => [
      String(i + 1), code(s.id), text(s.name), code(`@${s.agent}`), text(s.output ?? null), text(s.when ?? null), s.guardian ? 'sim' : 'não',
    ]);
    L.push(table(['Ordem', 'ID', 'Camada', 'Agente', 'Saída esperada', 'Quando', 'Guardião'], rows5), '');
  }

  L.push('## 6. Regras inegociáveis (deste projeto)', '');
  L.push('> O guardião recusa entregas que violem qualquer item.', '');
  if (cfg.rules?.length) cfg.rules.forEach((r, i) => L.push(`${i + 1}. ${String(r).replace(/\r?\n/g, ' ')}`));
  else L.push('nenhum');
  L.push('');

  L.push('## 7. Padrões proibidos (grep de ausência)', '');
  L.push('Executados por `node scripts/sdd.mjs check forbidden`; o resultado de cada linha tem de ser o esperado.', '');
  if (cfg.forbidden_patterns?.length) {
    L.push(table(['Padrão (regex)', 'Escopo (path)', 'Esperado', 'Motivo'],
      cfg.forbidden_patterns.map((f) => [code(f.pattern), code(f.scope), String(f.expected ?? 0), text(f.reason ?? null)])), '');
  } else L.push('nenhum', '');

  L.push('## 8. Gates de controle humano', '');
  if (cfg.human_gates?.length) {
    L.push(table(['Decisão', 'Entidade', 'Setter único permitido', 'Invariante'],
      cfg.human_gates.map((g) => [text(g.decision), text(g.entity), code(g.setter), text(g.invariant ?? null)])), '');
  } else L.push('nenhum', '');

  L.push('## 9. Tópicos bloqueados (pare e avise)', '');
  if (cfg.blocked_topics?.length) for (const b of cfg.blocked_topics) L.push(`- ${b}`);
  else L.push('- nenhum');
  L.push('');

  L.push('## 10. Defaults para o brief', '');
  if (cfg.defaults && Object.keys(cfg.defaults).length) {
    L.push(table(['Campo opcional', 'Default deste projeto'],
      Object.entries(cfg.defaults).map(([k, v]) => [keyLabel(k, DEFAULT_LABELS), text(v)])), '');
  } else L.push('nenhum', '');

  L.push('## 11. Portões de engenharia', '');
  if (cfg.engineering_gates && Object.keys(cfg.engineering_gates).length) {
    // Célula vazia = campo ausente; `n/a` = null. Assim a tabela representa o portão sem perda.
    const opt = (v, fmt) => (v === undefined ? '' : v === null ? 'n/a' : fmt(v));
    L.push(table(['Portão', 'Ativar?', 'Bloqueia?', 'Comando', 'Limite'],
      Object.entries(cfg.engineering_gates).map(([k, g]) => [
        keyLabel(k, GATE_LABELS), String(!!g.enabled), opt(g.blocking, String), opt(g.command, code), opt(g.threshold, text),
      ])), '');
    for (const [k, g] of Object.entries(cfg.engineering_gates)) {
      if (g.label !== undefined) ((ext.engineering_gates ??= {}))[k] = g;
    }
  } else L.push('nenhum', '');

  L.push('## 12. Design System', '');
  if (cfg.design_system && Object.keys(cfg.design_system).length) {
    let i = 1;
    for (const [k, obj] of Object.entries(cfg.design_system)) {
      L.push(`### 12.${i++} ${DS_SECTION_LABELS[k] ?? `\`${k}\``}`, '');
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { (ext.design_system ??= {})[k] = obj; continue; }
      const vals = Object.values(obj);
      if (vals.every((v) => v === null || typeof v !== 'object')) {
        L.push(table(['Item', 'Valor'], Object.entries(obj).map(([rk, v]) => [`\`${rk}\``, text(v)])), '');
      } else {
        const cols = [...new Set(vals.flatMap((v) => (v && typeof v === 'object' ? Object.keys(v) : [])))];
        L.push(table(['Item', ...cols.map((c) => `\`${c}\``)],
          Object.entries(obj).map(([rk, v]) => [`\`${rk}\``, ...cols.map((c) => text(v?.[c] ?? null))])), '');
      }
    }
  } else L.push('n/a — sem design system (ative o pack `ds` e preencha `design_system` se houver).', '');

  const extKeys = ['security', 'agents', 'integrations', 'observability', 'ai', 'legacy'];
  for (const k of extKeys) if (cfg[k] !== undefined) ext[k] = cfg[k];
  if (Object.keys(ext).length) {
    L.push('## 13. Extensões v3', '');
    L.push('Blocos sem representação em tabela na visão v2 (segurança, integrações, agentes, IA, legado).', '');
    L.push('```yaml');
    L.push(stringifyYaml(ext).trimEnd());
    L.push('```', '');
  }
  return L.join('\n');
}
