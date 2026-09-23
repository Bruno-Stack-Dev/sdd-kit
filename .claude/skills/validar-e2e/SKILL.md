---
name: validar-e2e
description: Roda os testes e2e do projeto com o comando declarado na config (commands.e2e), opcionalmente filtrando por arquivo ou teste, registra o resultado no estado e aponta como abrir relatório e trace. Use quando o usuário pedir para validar fluxos de ponta a ponta, rodar e2e/Playwright, ou rodar /validar-e2e.
disable-model-invocation: true
argument-hint: "[filtro]"
license: MIT
metadata:
  sdd-core: "true"
  sdd-version: "3.0.0"
---

# /validar-e2e [filtro]

**`sdd`** = `node "${CLAUDE_SKILL_DIR}/../../../scripts/sdd.mjs"`

1. `sdd config show --json` → `commands.e2e`. Se for `null`, diga que o projeto não tem e2e e encerre.
2. Primeira vez na máquina: o runner pode precisar de navegadores (ex.: `npx playwright install
   chromium`) — é download: peça confirmação antes.
3. Rode o comando; com `$ARGUMENTS`, passe-o como filtro (arquivo ou nome de teste).
4. Registre: `sdd event TEST_PASSED|TEST_FAILED --command "<cmd>"` (com `--spec` quando o filtro for
   de uma spec).
5. Reporte passou/falhou; em falha, indique relatório/trace e o CA afetado.

Cobertura esperada por feature navegável: entrar **pelo menu**, executar o caminho feliz de cada CA
navegável e verificar o resultado visível — ligando `CA-NN → teste e2e → resultado → evidência`.
Com o perfil MCP `e2e`, o Playwright MCP pode capturar evidências (screenshots/trace) em
`.sdd/reports/e2e/`.
