#!/usr/bin/env node
/**
 * sdd-lint — valida o frontmatter das specs do SDD Kit (sem dependências).
 *
 * Uso:  node scripts/sdd-lint.mjs            (a partir da raiz do projeto)
 * Sai com código 1 se houver erros; 0 se só houver avisos ou nada.
 *
 * Regras:
 *  - Toda spec em specs/features|architecture|apis precisa de frontmatter com:
 *      spec-id, titulo, status (rascunho|implementada|aprovada|arquivada), cas (número).
 *  - Docs em specs/discovery precisam de: doc-id, titulo, status (rascunho|aprovada|arquivada).
 *  - status: implementada com cas: 0  => aviso (CAs não declarados).
 *  - depende-de, se presente, deve ser uma lista.
 *  - sdd.config.md (se existir na raiz): as seções críticas 7 (Padrões proibidos) e 8 (Gates)
 *    não podem ficar só com placeholders (<TODO>, <ex.: ...>, <...>). Preencha com valores reais
 *    ou marque explicitamente como `nenhum`/`n/a`. O sdd.config.example.md NUNCA é validado.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

console.log(`\nsdd-lint: ${checked} spec(s) verificada(s) · ${errors} erro(s) · ${warns} aviso(s)`);
process.exit(errors > 0 ? 1 : 0);
