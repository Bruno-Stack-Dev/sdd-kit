#!/usr/bin/env node
/**
 * sdd-lint — valida o frontmatter das specs E os artefatos de .claude/ do SDD Kit (sem dependências).
 *
 * Uso:  node scripts/sdd-lint.mjs            (a partir da raiz do projeto)
 * Sai com código 1 se houver erros; 0 se só houver avisos ou nada.
 *
 * Regras (specs):
 *  - Toda spec em specs/features|architecture|apis precisa de frontmatter com:
 *      spec-id, titulo, status (rascunho|implementada|aprovada|arquivada), cas (número).
 *  - Docs em specs/discovery precisam de: doc-id, titulo, status (rascunho|aprovada|arquivada).
 *  - status: implementada com cas: 0  => aviso (CAs não declarados).
 *  - depende-de, se presente, deve ser uma lista.
 *  - sdd.config.md (se existir na raiz): as seções críticas 7 (Padrões proibidos) e 8 (Gates)
 *    não podem ficar só com placeholders (<TODO>, <ex.: ...>). Preencha com valores reais
 *    ou marque explicitamente como `nenhum`/`n/a`. O sdd.config.example.md NUNCA é validado.
 *    Conteúdo entre backticks (`...` e blocos ```) é ignorado, então genéricos como
 *    `Result<T, E>` na seção 7 não são confundidos com placeholders.
 *
 * Regras (.claude/):
 *  - Skills (cada .claude/skills/<dir>/SKILL.md, ignora diretórios que começam com `_`):
 *      name presente e igual ao nome do diretório; description presente e com 40..1024 chars;
 *      todo caminho em references: deve existir no disco.
 *  - Agentes (.claude/agents/*.md): name presente e igual ao nome do arquivo (sem .md);
 *      description presente.
 *  - Comandos (.claude/commands/*.md): frontmatter com description (aviso se ausente).
 *  - Caminhos internos: qualquer referência no formato `.claude/skills/<algo>` em arquivos
 *      .md/.py/.cjs/.mjs/.json que não exista no disco é reportada como erro.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const ROOT = process.cwd();
const DIRS = ['specs/features', 'specs/architecture', 'specs/apis', 'specs/discovery'];
const VALID_STATUS = new Set(['rascunho', 'implementada', 'aprovada', 'arquivada']);
const VALID_STATUS_DISCOVERY = new Set(['rascunho', 'aprovada', 'arquivada']);

let errors = 0, warns = 0, checked = 0;

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.md') && !name.startsWith('_') && name !== 'README.md') out.push(p);
  }
  return out;
}

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z0-9-]+):\s*(.*)$/i);
    if (kv) {
      // Descarta comentário inline no estilo YAML (" # ..."), preservando '#' dentro de aspas/regex.
      let val = kv[2].replace(/\s+#.*$/, '').trim();
      fm[kv[1]] = val;
    }
  }
  return fm;
}

for (const d of DIRS) {
  for (const file of walk(join(ROOT, d))) {
    checked++;
    const rel = file.replace(ROOT + '/', '').replace(ROOT + '\\', '');
    const fm = frontmatter(readFileSync(file, 'utf8'));
    if (!fm) { console.error(`✖ ${rel}: sem frontmatter`); errors++; continue; }

    // Docs de discovery (specs/discovery/*) têm outro shape: doc-id + titulo + status, sem cas.
    if (rel.replace(/\\/g, '/').startsWith('specs/discovery/')) {
      if (!fm['doc-id']) { console.error(`✖ ${rel}: falta 'doc-id'`); errors++; }
      if (!fm['titulo']) { console.error(`✖ ${rel}: falta 'titulo'`); errors++; }
      if (!VALID_STATUS_DISCOVERY.has(fm['status'])) {
        console.error(`✖ ${rel}: 'status' inválido ou ausente (${fm['status'] ?? '—'})`); errors++;
      }
      continue;
    }

    if (!fm['spec-id']) { console.error(`✖ ${rel}: falta 'spec-id'`); errors++; }
    if (!fm['titulo']) { console.error(`✖ ${rel}: falta 'titulo'`); errors++; }
    if (!VALID_STATUS.has(fm['status'])) {
      console.error(`✖ ${rel}: 'status' inválido ou ausente (${fm['status'] ?? '—'})`); errors++;
    }
    const cas = Number(fm['cas']);
    if (Number.isNaN(cas)) { console.error(`✖ ${rel}: 'cas' não é número`); errors++; }
    else if (fm['status'] === 'implementada' && cas === 0) {
      console.warn(`⚠ ${rel}: status 'implementada' mas 'cas: 0' — CAs não declarados?`); warns++;
    }
    if (fm['depende-de'] && !fm['depende-de'].startsWith('[')) {
      console.warn(`⚠ ${rel}: 'depende-de' deveria ser uma lista []`); warns++;
    }
  }
}

// --- Validação do sdd.config.md (opcional; só se existir na raiz) ---
// Garante que as seções críticas 7 (Padrões proibidos) e 8 (Gates) não fiquem só com
// placeholders. O motor e o guardião dependem delas para "provar ausência" — se ficarem
// como <TODO>/<ex.: ...>, a rede de segurança do kit vira decorativa.
function extractSection(text, num) {
  // Captura de "## <num>. ..." até o próximo "## " (ou fim do arquivo).
  const re = new RegExp(`^##\\s+${num}\\.[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, 'm');
  const m = text.match(re);
  return m ? m[1] : null;
}

function hasPlaceholder(body) {
  // Placeholders do template: <TODO>, <ex.: ...>, ou qualquer <...> não resolvido.
  return /<TODO>/i.test(body) || /<ex\.?:/i.test(body) || /<[^>\n]{1,80}>/.test(body);
}

function isExplicitlyEmpty(body) {
  // Considera "resolvido como vazio" se a seção declara nenhum/n/a fora de tabela.
  return /\b(nenhum|n\/a)\b/i.test(body);
}

const CONFIG = join(ROOT, 'sdd.config.md');
if (existsSync(CONFIG)) {
  const cfg = readFileSync(CONFIG, 'utf8');
  const CRITICAS = [
    { num: 7, nome: 'Padrões proibidos' },
    { num: 8, nome: 'Gates de controle humano' },
  ];
  for (const { num, nome } of CRITICAS) {
    const body = extractSection(cfg, num);
    if (body == null) {
      console.error(`✖ sdd.config.md: seção ${num} (${nome}) ausente`); errors++;
      continue;
    }
    // Um placeholder não resolvido sempre falha — mesmo que o texto explicativo mencione
    // "nenhum" (o example faz isso). "nenhum/n/a" só resolve a seção se NÃO houver placeholder.
    if (hasPlaceholder(body)) {
      console.error(
        `✖ sdd.config.md: seção ${num} (${nome}) ainda tem placeholders não resolvidos ` +
        `(<TODO>/<ex.: ...>). Preencha com valores reais ou marque como 'nenhum'.`);
      errors++;
      continue;
    }
    if (isExplicitlyEmpty(body)) continue; // 'nenhum'/'n/a' é uma resolução válida.
  }

  // Seção 11 — portões de engenharia opcionais. Não bloqueiam (são avisos informativos):
  // relatam quais portões o projeto ativou, para o @agente-devops espelhar no CI e o
  // desenvolvedor lembrar de rodá-los. Um portão "ativo" é uma linha de tabela cujo
  // "Ativar?" não é false/vazio/placeholder.
  const s11 = extractSection(cfg, 11);
  if (s11) {
    const ativos = [];
    for (const line of s11.split(/\r?\n/)) {
      const cols = line.split('|').map((c) => c.trim());
      // linha de tabela válida: | Portão | Ativar? | Como |  -> 5 células com bordas vazias
      if (cols.length >= 4 && cols[1] && cols[2] &&
          !/^portão$/i.test(cols[1]) && !/^-+$/.test(cols[1])) {
        const ativar = cols[2].toLowerCase();
        const desligado = ativar === 'false' || ativar === 'não' || ativar === 'nao' ||
                          hasPlaceholder(cols[2]) || ativar === '';
        if (!desligado) ativos.push(cols[1]);
      }
    }
    if (ativos.length) {
      console.warn(`⚠ portões de engenharia ativos (rode-os / espelhe no CI): ${ativos.join(', ')}`);
      warns += ativos.length;
    }
  }
}

// ======================================================================
// Validação de .claude/ — skills, agentes, comandos e caminhos internos.
// ======================================================================

// Helpers de frontmatter YAML (leves, sem dependência):
function fmBlock(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}
function fmScalar(block, key) {
  const m = block.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  if (!m) return undefined;
  let v = m[1].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}
function fmList(block, key) {
  // Aceita a forma inline `key: [a, b]` e a forma de bloco `key:\n  - a\n  - b`.
  const inline = block.match(new RegExp(`^${key}:[ \\t]*\\[(.*)\\]`, 'm'));
  if (inline) {
    return inline[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  const out = [];
  let capturing = false;
  for (const line of block.split(/\r?\n/)) {
    if (!capturing) {
      if (new RegExp(`^${key}:[ \\t]*$`).test(line)) capturing = true;
      continue;
    }
    const item = line.match(/^[ \t]+-[ \t]*(.*)$/);
    if (item) out.push(item[1].trim().replace(/^["']|["']$/g, ''));
    else if (/^\S/.test(line)) break; // próxima chave de topo encerra a lista
  }
  return out;
}

// --- 2.1 Skills ---
const SKILLS_DIR = join(ROOT, '.claude', 'skills');
if (existsSync(SKILLS_DIR)) {
  for (const name of readdirSync(SKILLS_DIR)) {
    if (name.startsWith('_')) continue;
    const dir = join(SKILLS_DIR, name);
    if (!statSync(dir).isDirectory()) continue;
    const rel = `.claude/skills/${name}/SKILL.md`;
    const skf = join(dir, 'SKILL.md');
    if (!existsSync(skf)) { console.error(`✖ ${rel}: SKILL.md ausente`); errors++; continue; }
    checked++;
    const block = fmBlock(readFileSync(skf, 'utf8'));
    if (!block) { console.error(`✖ ${rel}: sem frontmatter`); errors++; continue; }
    const nm = fmScalar(block, 'name');
    if (nm !== name) {
      console.error(`✖ ${rel}: 'name' (${nm ?? '—'}) difere do diretório '${name}'`); errors++;
    }
    const desc = fmScalar(block, 'description');
    if (desc === undefined) { console.error(`✖ ${rel}: falta 'description'`); errors++; }
    else if (desc.length < 40 || desc.length > 1024) {
      console.error(`✖ ${rel}: 'description' com ${desc.length} chars (fora de 40..1024)`); errors++;
    }
    for (const ref of fmList(block, 'references')) {
      if (!existsSync(resolve(dir, ref))) {
        console.error(`✖ ${rel}: references aponta para caminho inexistente '${ref}'`); errors++;
      }
    }
  }
}

// --- 2.2 Agentes ---
const AGENTS_DIR = join(ROOT, '.claude', 'agents');
if (existsSync(AGENTS_DIR)) {
  for (const f of readdirSync(AGENTS_DIR)) {
    if (!f.endsWith('.md') || f.startsWith('_')) continue;
    const rel = `.claude/agents/${f}`;
    checked++;
    const block = fmBlock(readFileSync(join(AGENTS_DIR, f), 'utf8'));
    if (!block) { console.error(`✖ ${rel}: sem frontmatter`); errors++; continue; }
    const base = f.replace(/\.md$/, '');
    const nm = fmScalar(block, 'name');
    if (nm !== base) {
      console.error(`✖ ${rel}: 'name' (${nm ?? '—'}) difere do arquivo '${base}'`); errors++;
    }
    if (fmScalar(block, 'description') === undefined) {
      console.error(`✖ ${rel}: falta 'description'`); errors++;
    }
  }
}

// --- 2.3 Comandos (aviso: vira erro quando todos tiverem description) ---
const CMD_DIR = join(ROOT, '.claude', 'commands');
if (existsSync(CMD_DIR)) {
  for (const f of readdirSync(CMD_DIR)) {
    if (!f.endsWith('.md') || f.startsWith('_')) continue;
    const rel = `.claude/commands/${f}`;
    checked++;
    const block = fmBlock(readFileSync(join(CMD_DIR, f), 'utf8'));
    const desc = block ? fmScalar(block, 'description') : undefined;
    if (desc === undefined) {
      console.warn(`⚠ ${rel}: sem frontmatter com 'description' (o menu / não mostra descrição)`); warns++;
    }
  }
}

// --- 2.4 Caminhos internos `.claude/skills/<algo>` que não existem no disco ---
function walkAllFiles(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkAllFiles(p, exts, out);
    else if (exts.has(extname(name))) out.push(p);
  }
  return out;
}
const CODE_EXTS = new Set(['.md', '.py', '.cjs', '.mjs', '.json']);
const skillPathRe = /\.claude\/skills\/[A-Za-z0-9._/-]*/g;
const seenRefs = new Set();
for (const file of walkAllFiles(ROOT, CODE_EXTS)) {
  const rel = file.replace(ROOT + '/', '').replace(ROOT + '\\', '').replace(/\\/g, '/');
  const text = readFileSync(file, 'utf8');
  let m;
  while ((m = skillPathRe.exec(text)) !== null) {
    // Ignora globs/placeholders: `.claude/skills/ds-*`, `.claude/skills/<nome>`.
    const next = text[skillPathRe.lastIndex];
    if (next === '*' || next === '<') continue;
    const ref = m[0].replace(/[.,;:)]+$/, ''); // remove pontuação de fim de frase
    // Ignora o prefixo puro (sem nome de skill).
    if (ref === '.claude/skills' || ref === '.claude/skills/') continue;
    if (existsSync(join(ROOT, ref))) continue;
    const key = `${rel}::${ref}`;
    if (seenRefs.has(key)) continue;
    seenRefs.add(key);
    console.error(`✖ ${rel}: caminho inexistente '${ref}'`); errors++;
  }
}

console.log(`\nsdd-lint: ${checked} item(ns) verificado(s) · ${errors} erro(s) · ${warns} aviso(s)`);
process.exit(errors > 0 ? 1 : 0);
