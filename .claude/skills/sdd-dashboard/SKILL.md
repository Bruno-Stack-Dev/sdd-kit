---
name: sdd-dashboard
description: "Abre o painel do SDD em tempo real (sdd dashboard: agentes, grafo de tarefas, specs e rastreabilidade, qualidade, segurança, eventos ao vivo, MCP/LSP) numa janela de terminal interativo, porque a TUI não roda dentro do chat. Confere o projeto antes com um quadro único (--once) e, quando não há como abrir uma janela, entrega o comando pronto para o usuário rodar. Somente leitura. Use quando o usuário pedir para abrir, ver ou acompanhar o dashboard ao vivo, ou rodar /sdd-dashboard."
argument-hint: "[--demo] [--tab <tela>] [--session <id>] [--ascii]"
license: MIT
metadata:
  sdd-core: "true"
  sdd-version: "3.0.0"
---

# /sdd-dashboard — painel ao vivo numa janela de terminal (somente leitura)

**`sdd`** = `node "${CLAUDE_SKILL_DIR}/../../../scripts/sdd.mjs"`

A TUI precisa de terminal interativo, e a saída das ferramentas do chat não é um: ali
`sdd dashboard` sai 1 ("terminal interativo não detectado"). Esta skill **não roda a TUI no chat**;
abre uma janela de terminal com ela. Não edite nada. Números e telas: `docs/dashboard.md`.

## 1. Argumentos

Aceite só estes, vindos de `$ARGUMENTS`: `--demo`, `--tab <overview|agents|tasks|specs|quality|security|events|runtime|1-8>`,
`--session <id>` (id alfanumérico, `-` e `_`), `--ascii`, `--no-color`. Qualquer outra coisa:
descarte e diga o que foi descartado. **Nunca** repasse texto livre ao shell.

## 2. Conferência (um quadro, sem interação)

`sdd dashboard --once --width 100 --height 14 <args>`, na raiz do projeto.

- Saída `1` com "nenhum projeto SDD": pare, mostre a mensagem e sugira `/sdd-init` (ou
  `/sdd-dashboard --demo` para ver a ferramenta com dados sintéticos).
- Saída `2` (uso incorreto): mostre o erro e pare.
- Saída `0`: siga e guarde o quadro, que é o que você mostra se a janela não abrir.

## 3. Abrir a janela

Resolva os caminhos **absolutos** da CLI (`${CLAUDE_SKILL_DIR}/../../../scripts/sdd.mjs`,
normalizado; no modo plugin ela não fica no projeto) e da raiz do projeto. A janela abre com a raiz
como diretório de trabalho. Rode **um** comando, conforme o sistema:

- **Windows** — execute no PowerShell (`powershell -NoProfile -Command "..."`), com cada argumento
  como um item da lista e a CLI entre aspas duplas (caminhos com espaço):
  `Start-Process -FilePath node -ArgumentList '"<cli>"','dashboard',<args> -WorkingDirectory '<raiz>'`
- **macOS** — `osascript -e 'tell application "Terminal" to do script "cd <raiz> && node <cli> dashboard <args>"' -e 'tell application "Terminal" to activate'`
  (caminhos entre aspas escapadas).
- **Linux** — só com sessão gráfica (`$DISPLAY` ou `$WAYLAND_DISPLAY`): o primeiro disponível
  entre `x-terminal-emulator -e`, `gnome-terminal --` e `konsole -e`, seguido de
  `node <cli> dashboard <args>`, com o diretório de trabalho na raiz.

Não tente abrir janela sem sessão gráfica (SSH, container, CI, WSL sem GUI): vá para o passo 4.
Uma tentativa só; se o comando falhar, não improvise outro terminal.

## 4. Sem janela

Se o host oferece um painel de terminal próprio (por exemplo, o painel Terminal do app desktop do
Claude), abra uma aba nele na raiz do projeto. Esse painel não digita nada, então peça ao usuário
que cole o comando. Em todo caso, entregue o comando pronto num bloco `bash`:

```bash
node "<cli>" dashboard <args>
```

e mostre o quadro do passo 2 como retrato do momento.

## 5. Resposta

Duas ou três linhas: onde o painel abriu, os atalhos essenciais (`1`–`8` telas · `Enter` detalhe ·
`w` por quê · `?` ajuda · `q` sai) e que, pelo chat, o resumo equivalente é `/sdd-status`. Com
`--demo`, avise que os dados são **sintéticos**. Não reproduza o painel inteiro nem estime números.
