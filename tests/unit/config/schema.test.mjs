import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validate, assertSupportedSchema, SchemaError } from '../../../scripts/lib/schema.mjs';
import { KIT_ROOT } from '../../helpers.mjs';

const S = {
  type: 'object',
  additionalProperties: false,
  required: ['nome'],
  properties: {
    nome: { type: 'string', minLength: 2 },
    idade: { type: 'integer', minimum: 0 },
    tipo: { enum: ['a', 'b'] },
    tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    re: { type: 'string', format: 'regex' },
    ref: { $ref: '#/$defs/par' },
    alt: { anyOf: [{ const: 'auto' }, { type: 'integer' }] },
  },
  $defs: { par: { type: 'object', required: ['k'], properties: { k: { type: ['string', 'null'] } } } },
};

test('dado válido não gera erros', () => {
  assert.deepEqual(validate(S, { nome: 'Ana', idade: 3, tipo: 'a', tags: ['x'], re: 'a+', ref: { k: null }, alt: 'auto' }), []);
});

test('erros com caminho legível', () => {
  const errs = validate(S, { idade: -1, tipo: 'c', tags: ['x', 'x'], re: '(', ref: {}, alt: 'x', nomee: 1 });
  const paths = errs.map((e) => e.path);
  for (const p of ['/nome', '/idade', '/tipo', '/tags/1', '/re', '/ref/k', '/alt', '/nomee']) assert.ok(paths.includes(p), `faltou ${p}: ${JSON.stringify(errs)}`);
  assert.match(errs.find((e) => e.path === '/nomee').message, /quis dizer 'nome'/);
});

test('tipo errado interrompe checagens do nó', () => {
  const errs = validate(S, { nome: 5 });
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /tipo esperado string/);
});

test('keyword não suportada é erro de schema, nunca ignorada', () => {
  assert.throws(() => assertSupportedSchema({ type: 'object', dependentRequired: {} }), SchemaError);
  assert.throws(() => assertSupportedSchema({ properties: { a: { if: {} } } }), SchemaError);
  assert.throws(() => assertSupportedSchema({ $ref: 'http://x' }), SchemaError);
});

test('todos os schemas do kit usam só keywords suportadas', () => {
  const dir = join(KIT_ROOT, 'schemas');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 1);
  for (const f of files) assert.doesNotThrow(() => assertSupportedSchema(JSON.parse(readFileSync(join(dir, f), 'utf8'))), f);
});
