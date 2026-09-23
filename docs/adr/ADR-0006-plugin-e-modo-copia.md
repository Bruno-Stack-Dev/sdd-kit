---
adr-id: ADR-0006
titulo: Motor distribuído como plugin do Claude Code, com modo cópia mantido
status: aceito
data: 2026-09-23
---

# ADR-0006: Plugin + modo cópia

## Contexto
No v2 o kit era copiado para cada projeto; atualizar o motor exigia copiar de novo, à mão, em cada
repositório, sem nenhuma versão detectável.

## Decisão
1. O repositório do kit **é** um plugin: `.claude-plugin/plugin.json` aponta `commands`, `agents` e
   `skills` para os diretórios `.claude/` existentes (sem duplicar arquivos) e `hooks` para
   `hooks/hooks.json`, que chama o mesmo `scripts/hooks/sdd-hook.mjs` via `${CLAUDE_PLUGIN_ROOT}`.
   `.claude-plugin/marketplace.json` publica o plugin (e, na Fase 16, os packs).
2. `sdd init --mode plugin` prepara o projeto só com o estado dele e registra o plugin no
   `settings.json` do projeto (`extraKnownMarketplaces`/`enabledPlugins`) para o time.
3. O **modo cópia** continua suportado: `sdd init --mode copy` copia os arquivos do motor
   (`ENGINE_OWNED` em `scripts/lib/install.mjs`) e `sdd upgrade` os atualiza com backup, relatando
   arquivos obsoletos sem apagá-los e mesclando o `settings.json` (preserva o que o projeto acrescentou).
4. **Versão detectável:** `.sdd/engine.json` registra modo e versão do motor; `sdd version` mostra
   motor, schemas de config/estado/eventos e política; o doctor compara versões e detecta hooks
   rodando em dobro (cópia + plugin).
5. Como a expansão de `${CLAUDE_PLUGIN_ROOT}` no Markdown de skills não é documentada, o caminho da
   CLI chega ao modelo pelo `SessionStart` ("CLI determinística: ...").

## Alternativas
- **Mover tudo para `skills/`, `agents/`, `commands/` na raiz** — quebraria o modo cópia e todos os
  caminhos citados em docs; os caminhos customizados do `plugin.json` evitam a mudança.
- **Só plugin** — abandonaria projetos v2 e ambientes sem acesso ao marketplace.

## Consequências
- No modo plugin, workflows ganham prefixo (`/sdd-kit:sdd-init`); os nomes curtos continuam no modo
  cópia.
- `plugin.json`, `marketplace.json` e `ENGINE_VERSION` precisam andar juntos (teste e doctor checam).
