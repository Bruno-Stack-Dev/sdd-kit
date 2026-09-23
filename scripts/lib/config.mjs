// Config executável do projeto (sdd.config.yaml) — carga, normalização e validação.
//
// Ordem de resolução em `loadConfig(root)`:
//   1. sdd.config.yaml  → canônico (v3)
//   2. sdd.config.md    → legado (v2), lido via migração em memória, com aviso
//   3. nenhum           → source: 'none'
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml, YamlError } from './yaml.mjs';
import { validate } from './schema.mjs';
import { parseLegacyConfigMd, renderConfigMd, isPlaceholder, GENERATED_MARKER } from './config-md.mjs';
import { ENGINE_ROOT, CONFIG_SCHEMA_VERSION } from './engine.mjs';
import { validateRouting } from './models.mjs';

export const CONFIG_YAML = 'sdd.config.yaml';
export const CONFIG_MD = 'sdd.config.md';

// Seções críticas: placeholder aqui é ERRO (a rede de segurança do kit não pode ficar decorativa).
const CRITICAL = ['/forbidden_patterns', '/human_gates', '/blocked_topics'];

let schemaCache;
export function configSchema() {
  schemaCache ??= JSON.parse(readFileSync(join(ENGINE_ROOT, 'schemas', 'sdd-config.schema.json'), 'utf8'));
  return schemaCache;
}

/** Preenche defaults e remove valores neutros, para comparação e consumo estáveis. */
export function normalizeConfig(input) {
  const cfg = structuredClone(input ?? {});
  const withDefaults = (obj, defaults) => {
    const out = { ...(obj ?? {}) };
    for (const [k, v] of Object.entries(defaults)) if (out[k] === undefined) out[k] = v;
    return out;
  };
  cfg.project = withDefaults(cfg.project, { name: null, type: null, domain: null, stage: null, updated_at: null });
  cfg.paths = withDefaults(cfg.paths, { specs: 'specs/' });
  cfg.numbering = withDefaults(cfg.numbering, { start: 'auto' });
  cfg.forbidden_patterns = (cfg.forbidden_patterns ?? []).map((f) => withDefaults(f, { expected: 0 }));
  cfg.human_gates = (cfg.human_gates ?? []).map((g) => withDefaults(g, { invariant: null }));
  for (const steps of Object.values(cfg.pipelines ?? {})) {
    if (!Array.isArray(steps)) continue;
    for (const s of steps) {
      if (s && s.guardian === false) delete s.guardian;
      for (const k of ['output', 'when']) if (s && s[k] === null) delete s[k];
    }
  }
  for (const f of cfg.forbidden_patterns) if (f.reason === null) delete f.reason;
  // Objeto vazio equivale a ausente (a visão Markdown escreve "nenhum" para ambos).
  for (const k of ['stack', 'defaults', 'engineering_gates', 'design_system']) {
    if (cfg[k] && typeof cfg[k] === 'object' && !Object.keys(cfg[k]).length) delete cfg[k];
  }
  return cfg;
}

function walk(value, path, visit) {
  visit(value, path);
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}/${i}`, visit));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, `${path}/${k}`, visit);
}

/** Diretórios onde procurar agentes: projeto primeiro, depois o motor (modo plugin). */
function agentDirs(root) {
  return [join(root, '.claude', 'agents'), join(ENGINE_ROOT, '.claude', 'agents')];
}

export function knownAgents(root) {
  const names = new Set();
  for (const d of agentDirs(root)) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) if (f.endsWith('.md') && !f.startsWith('_')) names.add(f.slice(0, -3));
  }
  return names;
}

/**
 * Valida uma config já parseada. Devolve { errors, warnings } com itens { path, message }.
 * Não lança: erro de schema/semântica vira item da lista.
 */
export function validateConfig(cfg, { root = process.cwd() } = {}) {
  const errors = [];
  const warnings = [];
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return { errors: [{ path: '(raiz)', message: 'a config deve ser um mapa YAML' }], warnings };
  }
  if (typeof cfg.version === 'number' && cfg.version !== CONFIG_SCHEMA_VERSION) {
    const msg = cfg.version > CONFIG_SCHEMA_VERSION
      ? `config versão ${cfg.version} é mais nova que o motor (suporta ${CONFIG_SCHEMA_VERSION}) — atualize o SDD Kit`
      : `config versão ${cfg.version} é antiga — rode \`node scripts/sdd.mjs config migrate\``;
    return { errors: [{ path: '/version', message: msg }], warnings };
  }
  for (const e of validate(configSchema(), cfg)) errors.push(e);

  // Placeholders não resolvidos (<TODO>, <ex.: ...>).
  walk(cfg, '', (v, path) => {
    if (!isPlaceholder(v)) return;
    const item = { path: path || '(raiz)', message: `placeholder não resolvido: ${JSON.stringify(v)}` };
    if (CRITICAL.some((c) => path === c || path.startsWith(`${c}/`))) {
      errors.push({ ...item, message: `${item.message} — seção crítica: preencha com valor real ou use lista vazia (= nenhum)` });
    } else warnings.push(item);
  });

  // Pipelines: IDs únicos, agentes existentes e habilitados, etapa de guardião presente.
  const agents = knownAgents(root);
  const disabled = new Set(cfg.agents?.disabled ?? []);
  for (const [name, steps] of Object.entries(cfg.pipelines ?? {})) {
    if (!Array.isArray(steps)) continue;
    const ids = new Set();
    steps.forEach((s, i) => {
      if (!s || typeof s !== 'object') return;
      const p = `/pipelines/${name}/${i}`;
      if (s.id && ids.has(s.id)) errors.push({ path: `${p}/id`, message: `ID de etapa duplicado '${s.id}' na pipeline '${name}'` });
      ids.add(s.id);
      if (typeof s.agent === 'string' && /^agente-/.test(s.agent)) {
        if (agents.size && !agents.has(s.agent)) errors.push({ path: `${p}/agent`, message: `agente '${s.agent}' não existe em .claude/agents/` });
        if (disabled.has(s.agent)) errors.push({ path: `${p}/agent`, message: `agente '${s.agent}' está em agents.disabled` });
      }
    });
    if (!steps.some((s) => s?.guardian)) {
      warnings.push({ path: `/pipelines/${name}`, message: 'pipeline sem etapa de guardião (guardian: true) — nada valida a entrega antes de fechar a spec' });
    }
  }
  // Roteamento de modelos: overrides/papéis de agentes existentes; escolha explícita abaixo do piso avisa.
  if (!errors.length) {
    const r = validateRouting(cfg, agents);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  if (cfg.commands && cfg.commands.test === null) {
    warnings.push({ path: '/commands/test', message: 'sem comando de testes (n/a): o gate de testes não tem como rodar' });
  }
  return { errors, warnings };
}

/** Carrega a config do projeto em `root`. Nunca lança. */
export function loadConfig(root = process.cwd()) {
  const yamlPath = join(root, CONFIG_YAML);
  const mdPath = join(root, CONFIG_MD);
  const hasYaml = existsSync(yamlPath);
  const hasMd = existsSync(mdPath);
  const result = { source: 'none', path: null, config: null, errors: [], warnings: [] };

  if (hasYaml) {
    result.source = 'yaml';
    result.path = yamlPath;
    try {
      result.config = parseYaml(readFileSync(yamlPath, 'utf8'));
    } catch (e) {
      result.errors.push({ path: CONFIG_YAML, message: e instanceof YamlError ? `YAML inválido: ${e.message}` : String(e.message ?? e) });
      return result;
    }
    const v = validateConfig(result.config, { root });
    result.errors.push(...v.errors);
    result.warnings.push(...v.warnings);
    if (hasMd && !result.errors.length) {
      const md = readFileSync(mdPath, 'utf8');
      if (!md.includes(GENERATED_MARKER)) {
        result.warnings.push({ path: CONFIG_MD, message: `existe um ${CONFIG_MD} escrito à mão ao lado do ${CONFIG_YAML}: o YAML é a fonte canônica — rode \`config render\` (o .md atual vai para .sdd/backup/)` });
      } else if (normalizeEol(md) !== normalizeEol(renderConfigMd(result.config))) {
        result.warnings.push({ path: CONFIG_MD, message: `a visão ${CONFIG_MD} está desatualizada em relação ao ${CONFIG_YAML} — rode \`node scripts/sdd.mjs config render\`` });
      }
    }
    return result;
  }
  if (hasMd) {
    result.source = 'md-legacy';
    result.path = mdPath;
    try {
      result.config = parseLegacyConfigMd(readFileSync(mdPath, 'utf8'));
    } catch (e) {
      result.errors.push({ path: CONFIG_MD, message: `não foi possível ler a config legada: ${e.message}` });
      return result;
    }
    result.warnings.push({ path: CONFIG_MD, message: `config legada (v2, Markdown) — rode \`node scripts/sdd.mjs config migrate\` para gerar o ${CONFIG_YAML} canônico` });
    const v = validateConfig(result.config, { root });
    result.errors.push(...v.errors);
    result.warnings.push(...v.warnings);
  }
  return result;
}

export function normalizeEol(s) {
  return s.replace(/\r\n/g, '\n');
}
