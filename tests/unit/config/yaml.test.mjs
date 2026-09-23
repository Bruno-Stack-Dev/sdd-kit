import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, stringifyYaml, YamlError } from '../../../scripts/lib/yaml.mjs';

test('mapas aninhados, listas de escalares e de mapas', () => {
  const doc = [
    'version: 3',
    'project:',
    '  name: Loja',
    '  tags: [a, "b c", 3]',
    'steps:',
    '  - id: um',
    '    agent: agente-x',
    '  - id: dois',
    '    extra:',
    '      k: v',
    'vazio:',
    'lista_compacta:',
    '- x',
    '- y',
  ].join('\n');
  assert.deepEqual(parseYaml(doc), {
    version: 3,
    project: { name: 'Loja', tags: ['a', 'b c', 3] },
    steps: [{ id: 'um', agent: 'agente-x' }, { id: 'dois', extra: { k: 'v' } }],
    vazio: null,
    lista_compacta: ['x', 'y'],
  });
});

test('escalares: tipos, aspas, escapes e comentários', () => {
  const doc = [
    'a: true',
    'b: null',
    'c: ~',
    'd: 1.5',
    'e: -7',
    "f: 'it''s'",
    'g: "linha\\nnova \\"q\\""',
    'h: texto # comentário',
    'i: "# não é comentário"',
    'j: http://exemplo.com/a#b',
    'k: <ex.: placeholder>',
    'l: "<ex.: Vue 3>"',
  ].join('\n');
  assert.deepEqual(parseYaml(doc), {
    a: true, b: null, c: null, d: 1.5, e: -7, f: "it's", g: 'linha\nnova "q"',
    h: 'texto', i: '# não é comentário', j: 'http://exemplo.com/a#b', k: '<ex.: placeholder>', l: '<ex.: Vue 3>',
  });
});

test('bloco literal | e dobrado >', () => {
  const doc = ['lit: |', '  linha 1', '  linha 2', 'strip: |-', '  só', 'fold: >-', '  a', '  b', 'depois: ok'].join('\n');
  assert.deepEqual(parseYaml(doc), { lit: 'linha 1\nlinha 2\n', strip: 'só', fold: 'a b', depois: 'ok' });
});

test('--- inicial é aceito; documento vazio é null', () => {
  assert.deepEqual(parseYaml('---\na: 1\n'), { a: 1 });
  assert.equal(parseYaml('# só comentário\n'), null);
});

const rejects = {
  'tab de indentação': 'a:\n\tb: 1',
  'âncora': 'a: &x 1',
  'alias': 'a: *x',
  'tag': 'a: !!str 1',
  'chave complexa': '? a\n: b',
  'escalar multilinha': 'a: um\n  dois',
  'chave duplicada': 'a: 1\na: 2',
  'fluxo multilinha': 'a: [1,\n  2]',
  'múltiplos documentos': 'a: 1\n---\nb: 2',
  'indentação inconsistente': 'a:\n  b: 1\n   c: 2',
};
for (const [nome, doc] of Object.entries(rejects)) {
  test(`rejeita com erro e linha: ${nome}`, () => {
    assert.throws(() => parseYaml(doc), (e) => e instanceof YamlError && /linha \d+/.test(e.message));
  });
}

test('stringify → parse preserva valores (round-trip), inclusive strings ambíguas', () => {
  const value = {
    version: 3,
    s: ['yes', 'no', '123', '1.0', 'true', 'null', '', ' espaço', 'a: b', '#x', '- item', 'multi\nlinha', 'aspas "d"', "aspas 's'", '<ex.: y>', 'ç ã é'],
    n: [0, -1, 2.5],
    b: [true, false],
    nada: null,
    vazio_l: [],
    vazio_o: {},
    nested: { lista: [{ a: 1, b: [1, 2] }, [3, 4], 'x'], 'chave com espaço': 'v', 'k:x': 1 },
  };
  assert.deepEqual(parseYaml(stringifyYaml(value)), value);
});

test('stringify é determinístico e aceita cabeçalho de comentário', () => {
  const out = stringifyYaml({ b: 1, a: [1] }, { header: 'linha A\nlinha B' });
  assert.equal(out, '# linha A\n# linha B\nb: 1\na:\n  - 1\n');
});
