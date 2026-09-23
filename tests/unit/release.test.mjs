// Coerência de release: versões sincronizadas, CHANGELOG com a versão, bloco do README igual ao
// que o `sdd init` injeta no CLAUDE.md, core sem dependências.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_ROOT } from '../helpers.mjs';
import { ENGINE_VERSION } from '../../scripts/lib/engine.mjs';
import { CLAUDE_BLOCK, CLAUDE_BEGIN, CLAUDE_END } from '../../scripts/lib/install.mjs';

const json = (f) => JSON.parse(readFileSync(join(KIT_ROOT, f), 'utf8'));

test('versões sincronizadas com ENGINE_VERSION', () => {
  assert.match(ENGINE_VERSION, /^\d+\.\d+\.\d+(-[\w.]+)?$/);
  assert.equal(json('package.json').version, ENGINE_VERSION);
  assert.equal(json('.claude-plugin/plugin.json').version, ENGINE_VERSION);
  for (const p of json('.claude-plugin/marketplace.json').plugins) assert.equal(p.version, ENGINE_VERSION, p.name);
  const packs = join(KIT_ROOT, '.claude', 'skills', '_packs');
  for (const pk of readdirSync(packs)) {
    const f = join('.claude', 'skills', '_packs', pk, '.claude-plugin', 'plugin.json');
    if (existsSync(join(KIT_ROOT, f))) assert.equal(json(f).version, ENGINE_VERSION, pk);
  }
});

test('CHANGELOG tem a versão atual e os documentos de release existem', () => {
  const cl = readFileSync(join(KIT_ROOT, 'CHANGELOG.md'), 'utf8');
  assert.ok(cl.includes(`## [${ENGINE_VERSION}]`), 'CHANGELOG sem a versão atual');
  for (const f of ['SECURITY.md', 'CONTRIBUTING.md', 'MIGRATION.md', 'THIRD_PARTY.md', 'LICENSE']) assert.ok(existsSync(join(KIT_ROOT, f)), f);
});

test('core sem dependências de runtime', () => {
  const pkg = json('package.json');
  assert.deepEqual(Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}), ...(pkg.peerDependencies ?? {}) }), []);
});

test('o bloco do README é o mesmo que o sdd init injeta no CLAUDE.md', () => {
  const readme = readFileSync(join(KIT_ROOT, 'README.md'), 'utf8').split(String.fromCharCode(13)).join('');
  const body = CLAUDE_BLOCK.replace(CLAUDE_BEGIN, '').replace(CLAUDE_END, '').trim();
  assert.ok(readme.includes(body), 'README.md: o bloco "Spec-Driven Development (SDD Kit)" divergiu de CLAUDE_BLOCK (scripts/lib/install.mjs)');
});
