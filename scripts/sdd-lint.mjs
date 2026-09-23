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
 *  - sdd.config.yaml (se existir): schema + checagens semânticas (scripts/lib/config.mjs).
 *
 * Checagens mais amplas (grafo de tarefas, estado, ADRs, segurança, MCP): `node scripts/sdd.mjs doctor`.
 *
 * Regras (.claude/):
 *  - Skills (cada .claude/skills/<dir>/SKILL.md, ignora diretórios que começam com `_`):
 *      name presente e igual ao nome do diretório; description presente e com 40..1024 chars;
 *      todo caminho em references: deve existir no disco. Packs vendorizados inativos em
 *      .claude/skills/_packs/<pack>/<skill>/ também são validados (serão ativados por cópia).
 *  - Agentes (.claude/agents/*.md): name presente e igual ao nome do arquivo (sem .md);
 *      description presente.
 *  - Comandos (.claude/commands/*.md): frontmatter com description obrigatório (erro se ausente).
 *  - Caminhos internos: qualquer referência no formato `.claude/skills/<algo>` em arquivos
 *      .md/.py/.cjs/.mjs/.json que não exista no disco é reportada como erro.
 */
import { runLint } from './lib/lint.mjs';

const { findings, checked, errors, warns } = runLint(process.cwd());
for (const f of findings) (f.level === 'error' ? console.error : console.warn)(f.text);
console.log(`\nsdd-lint: ${checked} item(ns) verificado(s) · ${errors} erro(s) · ${warns} aviso(s)`);
process.exit(errors > 0 ? 1 : 0);
