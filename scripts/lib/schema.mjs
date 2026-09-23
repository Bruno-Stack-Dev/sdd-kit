// Validador de um SUBCONJUNTO de JSON Schema (draft 2020-12) — zero dependências.
//
// Princípio: keyword desconhecida é ERRO ao compilar o schema, nunca ignorada em silêncio. Assim um
// schema do kit não pode "parecer" validar algo que o validador não implementa.

const ANNOTATIONS = new Set([
  '$schema', '$id', '$comment', 'title', 'description', 'default', 'examples', 'deprecated',
  'readOnly', 'writeOnly', 'x-legacy-section', 'x-doc',
]);
const SUPPORTED = new Set([
  'type', 'properties', 'required', 'additionalProperties', 'patternProperties', 'propertyNames',
  'enum', 'const', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength',
  'pattern', 'format', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'oneOf',
  'anyOf', 'allOf', 'not', '$ref', '$defs', 'minProperties', 'maxProperties',
]);
const FORMATS = {
  date: /^\d{4}-\d{2}-\d{2}$/,
  'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
  uri: /^[a-z][a-z0-9+.-]*:\/\/\S+$/i,
  regex: null, // validado com new RegExp
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
};

export class SchemaError extends Error {}

/** Verifica que o schema só usa keywords suportadas (recursivo). Lança SchemaError. */
export function assertSupportedSchema(schema, path = '#') {
  if (typeof schema === 'boolean') return;
  if (!schema || typeof schema !== 'object') throw new SchemaError(`${path}: schema deve ser objeto ou booleano`);
  for (const k of Object.keys(schema)) {
    if (ANNOTATIONS.has(k)) continue;
    if (!SUPPORTED.has(k)) throw new SchemaError(`${path}: keyword não suportada '${k}'`);
  }
  if (schema.format && !(schema.format in FORMATS)) throw new SchemaError(`${path}: format não suportado '${schema.format}'`);
  const sub = (s, p) => assertSupportedSchema(s, p);
  for (const [k, s] of Object.entries(schema.properties ?? {})) sub(s, `${path}/properties/${k}`);
  for (const [k, s] of Object.entries(schema.patternProperties ?? {})) sub(s, `${path}/patternProperties/${k}`);
  for (const [k, s] of Object.entries(schema.$defs ?? {})) sub(s, `${path}/$defs/${k}`);
  if (schema.additionalProperties !== undefined) sub(schema.additionalProperties, `${path}/additionalProperties`);
  if (schema.propertyNames !== undefined) sub(schema.propertyNames, `${path}/propertyNames`);
  if (schema.items !== undefined) sub(schema.items, `${path}/items`);
  if (schema.not !== undefined) sub(schema.not, `${path}/not`);
  for (const kw of ['oneOf', 'anyOf', 'allOf']) (schema[kw] ?? []).forEach((s, i) => sub(s, `${path}/${kw}/${i}`));
  if (schema.$ref && !schema.$ref.startsWith('#/$defs/')) throw new SchemaError(`${path}: só $ref locais '#/$defs/...' são suportados`);
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function typeMatches(v, t) {
  const actual = typeOf(v);
  if (t === 'number') return actual === 'number' || actual === 'integer';
  return actual === t;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fmtPath(parts) {
  return parts.length ? '/' + parts.join('/') : '(raiz)';
}

/**
 * Valida `data` contra `schema`. Devolve lista de erros { path, message }.
 * `root` é o schema raiz (para resolver $ref).
 */
export function validate(schema, data) {
  assertSupportedSchema(schema);
  const errors = [];
  check(schema, data, [], schema, errors);
  return errors;
}

function check(schema, data, path, root, errors) {
  if (schema === true) return;
  if (schema === false) { errors.push({ path: fmtPath(path), message: 'valor não permitido aqui' }); return; }
  if (schema.$ref) {
    const name = schema.$ref.slice('#/$defs/'.length);
    const target = root.$defs?.[name];
    if (!target) throw new SchemaError(`$ref não resolvido: ${schema.$ref}`);
    check(target, data, path, root, errors);
  }
  const p = fmtPath(path);

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(data, t))) {
      errors.push({ path: p, message: `tipo esperado ${types.join(' | ')}, recebido ${typeOf(data)}` });
      return; // o resto das checagens não faz sentido com o tipo errado
    }
  }
  if (schema.const !== undefined && !deepEqual(schema.const, data)) {
    errors.push({ path: p, message: `valor deve ser ${JSON.stringify(schema.const)}` });
  }
  if (schema.enum && !schema.enum.some((e) => deepEqual(e, data))) {
    errors.push({ path: p, message: `valor ${JSON.stringify(data)} fora de [${schema.enum.map((e) => JSON.stringify(e)).join(', ')}]` });
  }

  if (typeof data === 'string') {
    if (schema.minLength !== undefined && [...data].length < schema.minLength) errors.push({ path: p, message: `texto com menos de ${schema.minLength} caractere(s)` });
    if (schema.maxLength !== undefined && [...data].length > schema.maxLength) errors.push({ path: p, message: `texto com mais de ${schema.maxLength} caracteres` });
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(data)) errors.push({ path: p, message: `valor ${JSON.stringify(data)} não casa com o padrão ${schema.pattern}` });
    if (schema.format) {
      if (schema.format === 'regex') {
        try { new RegExp(data); } catch (e) { errors.push({ path: p, message: `regex inválida: ${e.message}` }); }
      } else if (!FORMATS[schema.format].test(data)) {
        errors.push({ path: p, message: `valor ${JSON.stringify(data)} não é um ${schema.format} válido` });
      }
    }
  }
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) errors.push({ path: p, message: `valor menor que ${schema.minimum}` });
    if (schema.maximum !== undefined && data > schema.maximum) errors.push({ path: p, message: `valor maior que ${schema.maximum}` });
    if (schema.exclusiveMinimum !== undefined && data <= schema.exclusiveMinimum) errors.push({ path: p, message: `valor deve ser maior que ${schema.exclusiveMinimum}` });
    if (schema.exclusiveMaximum !== undefined && data >= schema.exclusiveMaximum) errors.push({ path: p, message: `valor deve ser menor que ${schema.exclusiveMaximum}` });
  }
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) errors.push({ path: p, message: `lista precisa de ao menos ${schema.minItems} item(ns)` });
    if (schema.maxItems !== undefined && data.length > schema.maxItems) errors.push({ path: p, message: `lista com mais de ${schema.maxItems} itens` });
    if (schema.uniqueItems) {
      const seen = new Set();
      data.forEach((item, i) => {
        const key = JSON.stringify(item);
        if (seen.has(key)) errors.push({ path: fmtPath([...path, i]), message: 'item duplicado' });
        seen.add(key);
      });
    }
    if (schema.items !== undefined) data.forEach((item, i) => check(schema.items, item, [...path, i], root, errors));
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const keys = Object.keys(data);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) errors.push({ path: p, message: `objeto precisa de ao menos ${schema.minProperties} chave(s)` });
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) errors.push({ path: p, message: `objeto com mais de ${schema.maxProperties} chaves` });
    for (const r of schema.required ?? []) {
      if (!(r in data)) errors.push({ path: fmtPath([...path, r]), message: 'campo obrigatório ausente' });
    }
    const props = schema.properties ?? {};
    const patterns = Object.entries(schema.patternProperties ?? {}).map(([re, s]) => [new RegExp(re, 'u'), s]);
    for (const k of keys) {
      if (schema.propertyNames !== undefined) check(schema.propertyNames, k, [...path, k], root, errors);
      let matched = false;
      if (k in props) { matched = true; check(props[k], data[k], [...path, k], root, errors); }
      for (const [re, s] of patterns) if (re.test(k)) { matched = true; check(s, data[k], [...path, k], root, errors); }
      if (!matched && schema.additionalProperties !== undefined) {
        if (schema.additionalProperties === false) {
          const known = Object.keys(props);
          const hint = suggest(k, known);
          errors.push({ path: fmtPath([...path, k]), message: `campo desconhecido${hint ? ` (quis dizer '${hint}'?)` : ''}` });
        } else check(schema.additionalProperties, data[k], [...path, k], root, errors);
      }
    }
  }
  if (schema.allOf) for (const s of schema.allOf) check(s, data, path, root, errors);
  if (schema.anyOf) {
    const ok = schema.anyOf.some((s) => { const e = []; check(s, data, path, root, e); return !e.length; });
    if (!ok) errors.push({ path: p, message: 'valor não satisfaz nenhuma das alternativas permitidas' });
  }
  if (schema.oneOf) {
    const results = schema.oneOf.map((s) => { const e = []; check(s, data, path, root, e); return e; });
    const passing = results.filter((e) => !e.length).length;
    if (passing !== 1) {
      if (passing === 0) {
        // Mostra o erro da alternativa "mais próxima" (menos erros) para a mensagem ser útil.
        const best = results.reduce((a, b) => (b.length < a.length ? b : a));
        errors.push(...best);
      } else errors.push({ path: p, message: 'valor satisfaz mais de uma alternativa (oneOf)' });
    }
  }
  if (schema.not) {
    const e = [];
    check(schema.not, data, path, root, e);
    if (!e.length) errors.push({ path: p, message: 'valor corresponde a um formato proibido' });
  }
}

function suggest(k, known) {
  let best = null, bestD = 3;
  for (const cand of known) {
    const d = levenshtein(k, cand);
    if (d < bestD) { best = cand; bestD = d; }
  }
  return best;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[m][n];
}
