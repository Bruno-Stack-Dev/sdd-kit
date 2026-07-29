// Testes do sdd-lint (zero-dep, node:test nativo).
//
// Rode com:  node --test scripts/tests/
//
// Estratégia: cada teste cria um diretório temporário isolado contendo apenas um
// sdd.config.md forjado e executa o linter com cwd nesse diretório. Assim só a validação
// da config roda (não há specs/ nem .claude/ para atrapalhar) e checamos o exit code:
// 0 = passou, 1 = reprovou.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LINTER = fileURLToPath(new URL('../sdd-lint.mjs', import.meta.url));

// Monta uma config mínima válida variando apenas o corpo da seção 7. A seção 8 fica
// resolvida como `nenhum` para não interferir.
function config(section7) {
  return [
    '# sdd.config.md (fixture de teste)',
    '',
    '## 7. Padrões proibidos',
    '',
    section7,
    '',
    '## 8. Gates de controle humano',
    '',
    'nenhum',
    '',
    '## 9. Fim',
    '',
  ].join('\n');
}

// Roda o linter num dir temporário com a config dada; devolve o exit code.
function runLint(section7) {
  const dir = mkdtempSync(join(tmpdir(), 'sdd-lint-test-'));
  try {
    writeFileSync(join(dir, 'sdd.config.md'), config(section7));
    const res = spawnSync(process.execPath, [LINTER], { cwd: dir, encoding: 'utf8' });
    return res.status;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('seção 7 com genérico `Result<T, E>` em backticks → passa', () => {
  const s7 = [
    '| Padrão | Por quê |',
    '|---|---|',
    '| `Result<T, E>` cru na borda | Vaza detalhe interno |',
  ].join('\n');
  assert.equal(runLint(s7), 0);
});

test('seção 7 com <TODO> → falha', () => {
  assert.equal(runLint('| <TODO> | preencher |'), 1);
});

test('seção 7 com <ex.: nenhum> → falha', () => {
  assert.equal(runLint('| <ex.: nenhum> | exemplo não resolvido |'), 1);
});

test('seção 7 com "nenhum" → passa', () => {
  assert.equal(runLint('nenhum'), 0);
});
