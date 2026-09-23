---
name: sdd-export-context
description: "Empacota o código do projeto num único arquivo local e sanitizado (sem segredos nem arquivos sensíveis, respeitando o .gitignore) para revisão humana ou para usar como contexto em outro modelo; o Repomix é alternativa opcional com consentimento. Use quando o usuário pedir para exportar o contexto do projeto, gerar um pacote do código, preparar o repositório para colar num chat, ou rodar /sdd-export-context."
disable-model-invocation: true
argument-hint: "[finalidade] [--include glob] [--repomix]"
license: MIT
metadata:
  sdd-core: "true"
  sdd-version: "3.0.0"
---

# /sdd-export-context — pacote de contexto sanitizado

**`sdd`** = `node "${CLAUDE_SKILL_DIR}/../../../scripts/sdd.mjs"`

Exportar código é **tirar informação do projeto**. O arquivo gerado é local; enviá-lo a qualquer
lugar é decisão do usuário, nunca sua.

1. **Finalidade e recorte.** Pergunte (uma vez, se `$ARGUMENTS` não disser) para que serve e o que
   precisa entrar. Prefira recorte (`--include "src/**,specs/**"`) a exportar tudo: menos tokens,
   menos exposição.
2. **Dry-run primeiro:** `sdd export-context --dry-run [--include ...] [--exclude ...]`. Mostre ao
   usuário o resumo — arquivos, tokens estimados e **excluídos por motivo** (sensível, segredo,
   lockfile, tamanho, binário). Arquivo com possível segredo aparece com linha e tipo, nunca com o
   valor.
3. **Confirme** o recorte com o usuário. Não use `--redact` por conta própria: incluir um arquivo
   com trechos redigidos é escolha dele.
4. **Gere:** `sdd export-context [mesmos filtros] [--format markdown|xml]`. Padrão:
   `.sdd/context/context-<data>.md` (não versionado).
5. **Entregue** o caminho e lembre: revisar o arquivo antes de compartilhar; o detector de segredos
   é heurístico.

## Repomix (opcional)

Só se o usuário pedir. `sdd export-context --repomix` sem `--consent` mostra `NOT_RUN` e o comando
equivalente. Com consentimento explícito do usuário: `sdd export-context --repomix --consent` —
baixa e executa o Repomix (versão fixada) via `npx`, com o Secretlint dele ligado, os padrões
sensíveis do kit como `--ignore` e uma segunda varredura de segredos no resultado.

## Nunca

- Enviar, colar ou subir o pacote em serviço externo sem pedido explícito do usuário.
- Ler ou incluir `.env`, chaves, credenciais ou `.sdd/` (o exportador já os exclui — não contorne).
- Usar `--no-security-check` no Repomix.
