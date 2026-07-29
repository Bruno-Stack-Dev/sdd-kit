# SETUP — Instalação e primeiro uso do SDD Kit

Guia rápido para sair do zero até rodar o `/sdd-init`. Se você já usa o Claude Code no terminal
ou na IDE, pule direto para o **Passo 2**.

---

## Pré-requisitos

- **Claude Code** instalado e autenticado. É a ferramenta que interpreta os slash commands
  (`/sdd-init` etc.) deste kit. Guia oficial de instalação e requisitos (Node.js, sistemas
  suportados): https://docs.claude.com/en/docs/claude-code/overview
  - Pacote npm: https://www.npmjs.com/package/@anthropic-ai/claude-code
  - Confirme que funciona rodando `claude --version` no terminal, dentro de qualquer pasta.
- **Node.js** — o kit usa o `scripts/sdd-lint.mjs` (roda com `node`). O Claude Code também
  depende de Node; a versão mínima está na doc oficial acima.
- **Git** (recomendado, não obrigatório) — para versionar `specs/` junto do código.

> Não precisa de banco, Docker ou qualquer serviço para **começar**. O discovery de projeto
> novo roda só com o kit e o Claude Code.

---

## Passo 1 — Ter um projeto (ou uma pasta vazia)

Você pode usar o kit em dois pontos de partida:

- **Projeto novo:** crie uma pasta vazia (`mkdir meu-projeto`). Nada mais é necessário.
- **Projeto existente:** use a raiz do repositório que já roda.

Em ambos, **abrir o Claude Code nessa pasta** é o que importa (`cd meu-projeto && claude`).

---

## Passo 2 — Copiar o kit para a RAIZ do projeto

Copie o **conteúdo** de `sdd-kit/` para a raiz — não a pasta `sdd-kit` aninhada. Devem ficar
na raiz: `specs/`, `.claude/`, `scripts/` e `sdd.config.example.md`.

```bash
# a partir da raiz do projeto-alvo, com o kit descompactado ao lado:
cp -R caminho/para/sdd-kit/specs        ./
cp -R caminho/para/sdd-kit/.claude      ./
cp -R caminho/para/sdd-kit/scripts      ./
cp    caminho/para/sdd-kit/sdd.config.example.md ./
```

Confira que deu certo — estas três pastas têm de existir na raiz:

```bash
ls .claude specs/_gerador scripts/sdd-lint.mjs
```

> Se você copiar a pasta `sdd-kit` inteira por engano, o `/sdd-init` detecta o aninhamento no
> Passo A e te avisa para mover o conteúdo para a raiz. Nada quebra — só corrija e rode de novo.

---

## Passo 3 — Rodar o `/sdd-init`

No Claude Code, dentro da pasta do projeto:

```
/sdd-init
```

Ele vai, nesta ordem:
1. **Confirmar o diretório** (mostra `pwd`, checa a âncora do kit e pergunta se é a raiz certa).
2. **Detectar** se o projeto é **novo** ou **já em produção**, com evidência, e confirmar com você.
3. **Rotear:**
   - **Novo** → entrevista de **discovery em blocos** (produto → dados → arquitetura/stack →
     planejamento → infra) e, ao fim, gera `specs/discovery/`, ADRs, `sdd.config.md`,
     `CLAUDE.md` e um brief em `specs/_entrada/`.
   - **Existente** → **engenharia reversa** do código: reconstrói a documentação a partir do
     que já existe, pergunta só o que o código não revela, e registra divergências.

### Sem usar o slash command?

O `/sdd-init` é um atalho. O "motor" são arquivos markdown — qualquer Claude executa lendo-os.
Se preferir (ou se o comando não aparecer), basta pedir no chat:

> "Leia `specs/_gerador/DISCOVERY.md` e conduza a entrevista comigo."   *(projeto novo)*
> "Leia `specs/_gerador/AUDITORIA.md` e faça a engenharia reversa deste repo."   *(existente)*

---

## Passo 4 — Validar

```bash
node scripts/sdd-lint.mjs        # specs/discovery + seções 7/8 da config + artefatos de .claude/
```

> Após o `/sdd-init`, o linter também verifica se as seções **7 (Padrões proibidos)** e
> **8 (Gates)** do `sdd.config.md` foram preenchidas — ele falha se sobrarem placeholders
> (`<TODO>`/`<ex.: ...>`). Resolva-as com valores reais ou escreva `nenhum`. Genéricos entre
> backticks (ex.: `` `Result<T, E>` ``) na seção 7 **não** são tratados como placeholder.

> O linter agora cobre também o diretório **`.claude/`**: cada skill (`name` igual ao diretório,
> `description` presente com 40–1024 chars e `references:` existentes), cada agente (`name` igual
> ao arquivo e `description` presente) e cada comando (`description` no frontmatter). Além disso,
> qualquer caminho `.claude/skills/<algo>` citado em arquivos `.md`/`.py`/`.cjs`/`.mjs`/`.json`
> que não exista no disco é reportado como erro — pega links internos que ficaram para trás.

O kit também tem testes unitários do próprio linter (zero-dep, `node:test`):

```bash
node --test scripts/tests/
```

> No Windows, se a forma de diretório acima devolver `MODULE_NOT_FOUND` (quirk conhecido do
> discovery de testes por diretório), use o padrão de arquivos: `node --test scripts/tests/*.test.mjs`.

Depois disso: `/sdd-status` para ver o painel, `/gerar-projeto` para o pipeline (projeto novo),
ou `/nova-spec` para um incremento. Referência de comandos e agentes: `README.md` e `.claude/README.md`.

---

## Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---------|----------------|-------------|
| `/sdd-init` não aparece | Kit não está na raiz, ou `.claude/commands/` ausente | Confira o Passo 2; reabra o Claude Code na pasta |
| "kit aninhado" no Passo A | Copiou a pasta `sdd-kit` inteira | Mova o **conteúdo** para a raiz |
| `node: command not found` | Node.js não instalado | Instale Node (ver doc oficial do Passo de pré-requisitos) |
| `claude: command not found` | Claude Code não instalado/no PATH | Ver https://docs.claude.com/en/docs/claude-code/overview |
| Comandos pedem confirmação a cada passo | Allowlist não aplicado | Confirme que `.claude/settings.json` veio junto |
