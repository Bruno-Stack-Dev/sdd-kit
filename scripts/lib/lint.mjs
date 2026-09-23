// Regras do sdd-lint como biblioteca: `runLint(root)` devolve os achados em ordem, sem imprimir.
// Usada pelo CLI scripts/sdd-lint.mjs (fast path, saída inalterada) e pelo `sdd doctor`.
// Regras: ver o cabeçalho de scripts/sdd-lint.mjs. Comportamento protegido pelos testes de
// tests/characterization/lint.characterization.test.mjs.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { loadConfig, CONFIG_YAML } from './config.mjs';

/**
 * @returns {{ findings: {level: 'error'|'warn', text: string, weight: number}[], checked: number, errors: number, warns: number }}
 */
export function runLint(ROOT = process.cwd()) {
  const findings = [];
  let errors = 0, warns = 0, checked = 0;
  const emit = (level, text, weight = 1) => {
    findings.push({ level, text, weight });
    if (level === 'error') errors += weight;
    else warns += weight;
  };

  const DIRS = ['specs/features', 'specs/architecture', 'specs/apis', 'specs/discovery'];
  const VALID_STATUS = new Set(['rascunho', 'implementada', 'aprovada', 'arquivada']);
  const VALID_STATUS_DISCOVERY = new Set(['rascunho', 'aprovada', 'arquivada']);



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
      if (!fm) { emit('error', `✖ ${rel}: sem frontmatter`); continue; }

      // Docs de discovery (specs/discovery/*) têm outro shape: doc-id + titulo + status, sem cas.
      if (rel.replace(/\\/g, '/').startsWith('specs/discovery/')) {
        if (!fm['doc-id']) { emit('error', `✖ ${rel}: falta 'doc-id'`); }
        if (!fm['titulo']) { emit('error', `✖ ${rel}: falta 'titulo'`); }
        if (!VALID_STATUS_DISCOVERY.has(fm['status'])) {
          emit('error', `✖ ${rel}: 'status' inválido ou ausente (${fm['status'] ?? '—'})`);
        }
        continue;
      }

      if (!fm['spec-id']) { emit('error', `✖ ${rel}: falta 'spec-id'`); }
      if (!fm['titulo']) { emit('error', `✖ ${rel}: falta 'titulo'`); }
      if (!VALID_STATUS.has(fm['status'])) {
        emit('error', `✖ ${rel}: 'status' inválido ou ausente (${fm['status'] ?? '—'})`);
      }
      const cas = Number(fm['cas']);
      if (Number.isNaN(cas)) { emit('error', `✖ ${rel}: 'cas' não é número`); }
      else if (fm['status'] === 'implementada' && cas === 0) {
        emit('warn', `⚠ ${rel}: status 'implementada' mas 'cas: 0' — CAs não declarados?`);
      }
      if (fm['depende-de'] && !fm['depende-de'].startsWith('[')) {
        emit('warn', `⚠ ${rel}: 'depende-de' deveria ser uma lista []`);
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

  function stripCode(text) {
    // Remove blocos cercados (```...```) e código inline (`...`). Genéricos como
    // `Result<T, E>`, `Promise<any>`, `List<Object>` vivem em backticks e NÃO são placeholders.
    return text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
  }

  function hasPlaceholder(body) {
    // Só os formatos que o template realmente produz contam como placeholder não resolvido:
    //   <TODO>          e
    //   <ex.: ...>  /  <algo — ex.: ...>   (qualquer <...> que contenha "ex.:").
    // Genéricos entre backticks são removidos antes, então `Result<T, E>` na seção 7 passa.
    const s = stripCode(body);
    return /<TODO>/i.test(s) || /<[^>\n]*ex\.?:/i.test(s);
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
        emit('error', `✖ sdd.config.md: seção ${num} (${nome}) ausente`);
        continue;
      }
      // Um placeholder não resolvido sempre falha — mesmo que o texto explicativo mencione
      // "nenhum" (o example faz isso). "nenhum/n/a" só resolve a seção se NÃO houver placeholder.
      if (hasPlaceholder(body)) {
        emit('error', 
          `✖ sdd.config.md: seção ${num} (${nome}) ainda tem placeholders não resolvidos ` +
          `(<TODO>/<ex.: ...>). Preencha com valores reais ou marque como 'nenhum'.`);
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
        emit('warn', `⚠ portões de engenharia ativos (rode-os / espelhe no CI): ${ativos.join(', ')}`, ativos.length);
      }
    }
  }

  // --- Validação do sdd.config.yaml (v3, canônico) — schema + semântica ---
  // Config inválida é rejeitada aqui, antes de o motor gerar qualquer código (Passo 0 do GERADOR).
  if (existsSync(join(ROOT, CONFIG_YAML))) {
    checked++;
    const r = loadConfig(ROOT);
    for (const e of r.errors) { emit('error', `✖ ${CONFIG_YAML}: ${e.path}: ${e.message}`); }
    for (const w of r.warnings) { emit('warn', `⚠ ${CONFIG_YAML}: ${w.path}: ${w.message}`); }
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

  // --- 2.1 Skills (ativas em .claude/skills/* e inativas em .claude/skills/_packs/<pack>/*) ---
  const SKILLS_DIR = join(ROOT, '.claude', 'skills');

  function validateSkill(dir, name, relBase) {
    const rel = `${relBase}/SKILL.md`;
    const skf = join(dir, 'SKILL.md');
    if (!existsSync(skf)) { emit('error', `✖ ${rel}: SKILL.md ausente`); return; }
    checked++;
    const block = fmBlock(readFileSync(skf, 'utf8'));
    if (!block) { emit('error', `✖ ${rel}: sem frontmatter`); return; }
    const nm = fmScalar(block, 'name');
    if (nm !== name) {
      emit('error', `✖ ${rel}: 'name' (${nm ?? '—'}) difere do diretório '${name}'`);
    }
    const desc = fmScalar(block, 'description');
    if (desc === undefined) { emit('error', `✖ ${rel}: falta 'description'`); }
    else if (desc.length < 40 || desc.length > 1024) {
      emit('error', `✖ ${rel}: 'description' com ${desc.length} chars (fora de 40..1024)`);
    }
    for (const ref of fmList(block, 'references')) {
      if (!existsSync(resolve(dir, ref))) {
        emit('error', `✖ ${rel}: references aponta para caminho inexistente '${ref}'`);
      }
    }
  }

  if (existsSync(SKILLS_DIR)) {
    for (const name of readdirSync(SKILLS_DIR)) {
      if (name.startsWith('_')) continue;
      const dir = join(SKILLS_DIR, name);
      if (!statSync(dir).isDirectory()) continue;
      validateSkill(dir, name, `.claude/skills/${name}`);
    }
    // Packs vendorizados ficam inativos em _packs/<pack>/<skill>/ (ativados por cópia via /sdd-init).
    // Diretórios de notas do pack (que começam com `_`, ex.: _knowledge-notes) são ignorados.
    const PACKS_DIR = join(SKILLS_DIR, '_packs');
    if (existsSync(PACKS_DIR)) {
      for (const pack of readdirSync(PACKS_DIR)) {
        const packDir = join(PACKS_DIR, pack);
        if (!statSync(packDir).isDirectory()) continue;
        for (const name of readdirSync(packDir)) {
          if (name.startsWith('_')) continue;
          const dir = join(packDir, name);
          if (!statSync(dir).isDirectory()) continue;
          validateSkill(dir, name, `.claude/skills/_packs/${pack}/${name}`);
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
      if (!block) { emit('error', `✖ ${rel}: sem frontmatter`); continue; }
      const base = f.replace(/\.md$/, '');
      const nm = fmScalar(block, 'name');
      if (nm !== base) {
        emit('error', `✖ ${rel}: 'name' (${nm ?? '—'}) difere do arquivo '${base}'`);
      }
      if (fmScalar(block, 'description') === undefined) {
        emit('error', `✖ ${rel}: falta 'description'`);
      }
    }
  }

  // --- 2.3 Comandos (todos precisam de description no frontmatter) ---
  const CMD_DIR = join(ROOT, '.claude', 'commands');
  if (existsSync(CMD_DIR)) {
    for (const f of readdirSync(CMD_DIR)) {
      if (!f.endsWith('.md') || f.startsWith('_')) continue;
      const rel = `.claude/commands/${f}`;
      checked++;
      const block = fmBlock(readFileSync(join(CMD_DIR, f), 'utf8'));
      const desc = block ? fmScalar(block, 'description') : undefined;
      if (desc === undefined) {
        emit('error', `✖ ${rel}: sem frontmatter com 'description' (o menu / não mostra descrição)`);
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

  // Um resto de caminho (após `.claude/skills/`) existe sob algum pack inativo?
  function existsSyncInAnyPack(sub) {
    const packsDir = join(ROOT, '.claude', 'skills', '_packs');
    if (!existsSync(packsDir)) return false;
    const parts = sub.split('/').filter(Boolean);
    for (const pack of readdirSync(packsDir)) {
      const packDir = join(packsDir, pack);
      if (!statSync(packDir).isDirectory()) continue;
      if (existsSync(join(packDir, ...parts))) return true;
    }
    return false;
  }
  for (const file of walkAllFiles(ROOT, CODE_EXTS)) {
    const rel = file.replace(ROOT + '/', '').replace(ROOT + '\\', '').replace(/\\/g, '/');
    const text = readFileSync(file, 'utf8');
    let m;
    while ((m = skillPathRe.exec(text)) !== null) {
      // Ignora globs/placeholders/interpolações: `.claude/skills/ds-*`,
      // `.claude/skills/<nome>`, `.claude/skills/${pack}` (caminho computado em código).
      const next = text[skillPathRe.lastIndex];
      if (next === '*' || next === '<' || next === '$') continue;
      const ref = m[0].replace(/[.,;:)]+$/, ''); // remove pontuação de fim de frase
      // Ignora o prefixo puro (sem nome de skill).
      if (ref === '.claude/skills' || ref === '.claude/skills/') continue;
      if (existsSync(join(ROOT, ref))) continue;
      // Fallback: a skill referida pode estar num pack inativo. Um caminho
      // `.claude/skills/<resto>` é válido se existir sob `.claude/skills/_packs/<pack>/<resto>`
      // (o pack é validado como se fosse ativado por cópia).
      const sub = ref.slice('.claude/skills/'.length);
      if (sub && existsSyncInAnyPack(sub)) continue;
      const key = `${rel}::${ref}`;
      if (seenRefs.has(key)) continue;
      seenRefs.add(key);
      emit('error', `✖ ${rel}: caminho inexistente '${ref}'`);
    }
  }


  return { findings, checked, errors, warns };
}
