---
adr-id: ADR-0018
titulo: Export de contexto embutido e sanitizado; Repomix opcional com consentimento
status: aceito
data: 2026-09-23
---

# ADR-0018: `sdd export-context`

## Contexto
Empacotar o repositório num arquivo único (para revisão ou para outro modelo) é pedido comum e é,
por natureza, uma saída de informação. O Repomix faz isso bem (respeita `.gitignore`, Secretlint
ligado por padrão), mas exige baixar e executar um pacote do npm — o que o core zero-dependência não
pode fazer implicitamente.

## Decisão
- Exportador **embutido** e sem dependências: lista de arquivos via
  `git ls-files --cached --others --exclude-standard` (respeita `.gitignore`); fora de git, varredura
  com diretórios padrão ignorados e aviso explícito no pacote.
- Exclusões sempre ativas: caminhos sensíveis (`isSensitivePath` + `.npmrc`, `.pypirc`,
  `.git-credentials`, `.claude/settings.local.json`, `.sdd/`), lockfiles (salvo
  `--include-lockfiles`), minificados, binários e arquivos acima de `--max-kb` (256 KiB padrão).
- Arquivo com possível segredo é **excluído** e relatado com linha e tipo, nunca com o valor;
  `--redact` o inclui com os trechos redigidos (decisão do usuário).
- `--dry-run` mostra inclusões/exclusões por motivo e tokens estimados sem escrever.
- Saída padrão em `.sdd/context/` (não versionada; o `.sdd/.gitignore` ganha `context/`).
  Markdown com fence maior que qualquer sequência de crases do conteúdo, ou XML com CDATA.
- `--repomix` sem `--consent` → `NOT_RUN` com o comando equivalente; com consentimento, roda
  `repomix@1.18.1` fixado via `npx`, com os padrões sensíveis como `--ignore`, **nunca**
  `--no-security-check`, e uma segunda varredura dos padrões do kit no resultado.
- Skill núcleo `sdd-export-context` com `disable-model-invocation: true`: finalidade → dry-run →
  confirmação → geração; nunca envia o pacote a serviço externo.

## Alternativas consideradas
- **Só Repomix** — rejeitada como padrão: execução de código de terceiros por `npx` a cada uso.
- **Nenhum exportador** — o usuário faria à mão, sem filtro de segredos.

## Consequências
- Detector de segredos é heurístico; o pacote diz explicitamente para revisar antes de compartilhar.
- Nada sai da máquina: o kit gera um arquivo local; enviar é decisão do usuário.
