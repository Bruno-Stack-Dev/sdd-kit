# Fechamento do /sdd-init (novo e existente)

`sdd` = a CLI do motor (ver SKILL.md).

## 1. Config

1. `sdd config validate` — corrija até sair 0. Nas listas críticas (`forbidden_patterns`,
   `human_gates`, `blocked_topics`) use `[]` quando não se aplicam; placeholder ali é erro.
2. `sdd config render` — gera a visão `sdd.config.md`.

## 2. Permissões da stack

O `.claude/settings.json` traz um piso genérico (Node, git seguro, deny de segredos e hooks do SDD).
A partir de `commands` da config, **acrescente ao `allow`** os binários reais do projeto que faltarem
(ex.: `Bash(pytest:*)`, `Bash(go test:*)`, `Bash(dotnet test:*)`, o runner de migrations).
Referência: `.claude/settings.example.python.json` e `settings.example.go.json` do motor.
**Nunca remova** entradas de `deny` nem os hooks. Alterar o settings pede confirmação (política).

## 3. Packs opcionais

Os packs vêm **inativos** (`.claude/skills/_packs/`). Avalie com o usuário:

| Pack | Ative quando | Observação |
|------|--------------|------------|
| `arch` | decisões de arquitetura não triviais (cadeia do Bloco 3 do discovery) | ative **antes** de usar skills `arch-*` |
| `ds` | o projeto tem/mantém design system | preencha `design_system` na config |
| `uiux` | há trabalho de UI/design | requer `python`/`python3` |
| `ai` | o **produto** usa LLM/agentes/RAG | gera artefatos AI-* no discovery |

Ative com `sdd pack activate <pack>` (verifica hash e licença contra `skills.lock.json` e registra o
evento). Registre a escolha em `integrations.packs` da config.

## 4. Sandbox

- macOS/Linux/WSL2: recomende `sdd security sandbox --enable` (isola filesystem e rede).
- Windows nativo: o sandbox não roda; explique que as regras críticas continuam valendo pelos hooks e
  que o isolamento completo exige WSL2. Não force.

## 5. Code intelligence

Rode `sdd lsp detect` e recomende o plugin de LSP oficial das linguagens encontradas (o comando
mostra o binário necessário). Registre em `integrations.lsp`.

## 6. MCP

Proponha o perfil MCP adequado (`sdd mcp profiles`) — `minimal` (Context7) por padrão, `e2e` quando
houver UI navegável — e aplique com `sdd mcp apply <perfil>`. Nenhum servidor fora da allowlist.

## 7. Registro e validação

1. `sdd event DISCOVERY_COMPLETED` (se o estado existir).
2. `sdd doctor --fast` e `sdd doctor --security`: reporte o resultado sem mascarar avisos.
3. Liste os `<TODO>` restantes e o próximo passo.
