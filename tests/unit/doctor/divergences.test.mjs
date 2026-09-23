import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDivergences, parseDivergences } from '../../../scripts/lib/divergences.mjs';

const table = (rows) => ['| ID | Tema | Intended | Observed | Runtime | Classificação | Proveniência | Resolução |', '|---|---|---|---|---|---|---|---|', ...rows].join('\n');
const row = (o) => `| ${o.id ?? 'DIV-01'} | ${o.tema ?? 'exclusão'} | ${o.intended ?? 'só admin'} | ${o.observed ?? 'sem checagem (a.ts:1)'} | ${o.runtime ?? 'não verificada'} | ${o.cls ?? 'SECURITY_DRIFT'} | ${o.prov ?? 'CODE'} | ${o.res ?? 'pendente'} |`;

test('drift de segurança pendente é válido (e vira aviso de decisão humana)', () => {
  const r = validateDivergences(table([row({})]));
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /SECURITY_DRIFT pendente/.test(w)));
});

test('SECURITY_DRIFT não pode ser resolvido por "código prevalece" nem sem evidência', () => {
  assert.match(validateDivergences(table([row({ res: 'código prevalece' })])).errors[0], /código prevalece/);
  assert.match(validateDivergences(table([row({ res: 'corrigir-doc' })])).errors[0], /sem evidência de RUNTIME nem USER_CONFIRMED/);
  assert.match(validateDivergences(table([row({ res: 'aceito-intencional' })])).errors[0], /exige ADR/);
});

test('SECURITY_DRIFT resolvido com evidência de runtime, confirmação ou ADR é aceito', () => {
  assert.deepEqual(validateDivergences(table([row({ runtime: 'teste e2e: 403 para usuário comum', res: 'corrigir-código' })])).errors, []);
  assert.deepEqual(validateDivergences(table([row({ prov: 'CODE, USER_CONFIRMED', res: 'corrigir-doc' })])).errors, []);
  assert.deepEqual(validateDivergences(table([row({ runtime: 'log de produção', res: 'aceito-intencional (ADR-012)' })])).errors, []);
});

test('classificação e proveniência inválidas; tags v2 aceitas; linha de exemplo ignorada', () => {
  const r = validateDivergences(table([row({ cls: 'BUG', prov: 'ACHISMO' }), row({ id: 'DIV-02', cls: 'DOC_DRIFT', prov: 'código, usuário', res: 'corrigir-doc' }), row({ id: 'X', tema: '<ex.: tema>' })]));
  assert.equal(r.errors.length, 2);
  assert.match(r.errors.join(' '), /classificação 'BUG'/);
  assert.match(r.errors.join(' '), /proveniência inválida 'ACHISMO'/);
});

test('relatório no formato v2 gera aviso de reclassificação', () => {
  const v2 = '| # | Tema | Usuário afirmou | Código mostra | Resolução |\n|---|---|---|---|---|\n| 1 | api | REST | GraphQL | código prevalece — revisar |';
  const r = validateDivergences(v2);
  assert.equal(parseDivergences(v2).format, 'legacy');
  assert.match(r.warnings[0], /formato v2/);
});
