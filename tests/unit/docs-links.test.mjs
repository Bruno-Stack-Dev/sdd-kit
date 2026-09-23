// Links relativos da documentação do kit apontam para arquivos que existem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { KIT_ROOT } from '../helpers.mjs';
import { candidateFiles } from '../../scripts/lib/export-context.mjs';

// Rastreados + novos não ignorados (git), para pegar links de arquivos ainda não commitados.
const files = candidateFiles(KIT_ROOT).files
  .filter((f) => f.endsWith('.md'))
  // Conteúdo vendorizado mantém os links do upstream; fixtures são projetos sintéticos.
  .filter((f) => !f.includes('/_packs/') && !f.startsWith('tests/fixtures/'))
  .filter((f) => existsSync(join(KIT_ROOT, f)));

test('links relativos em Markdown resolvem', () => {
  const broken = [];
  for (const f of files) {
    const text = readFileSync(join(KIT_ROOT, f), 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1].split('#')[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('<')) continue;
      if (!existsSync(join(KIT_ROOT, dirname(f), decodeURIComponent(target)))) broken.push(`${f} → ${m[1]}`);
    }
  }
  assert.deepEqual(broken, []);
});
