# Code intelligence (LSP)

**Objetivo:** agentes navegam por símbolos (definição, referências, diagnósticos, tipos) em vez de ler
dezenas de arquivos ou varrer o repositório com Grep.

## Estratégia

1. **Detectar** — `sdd lsp detect` identifica as linguagens por manifestos e extensões, procura o
   language server no PATH (sem executá-lo) e indica o plugin LSP oficial do Claude Code:

   | Linguagem | Plugin | Binário |
   |-----------|--------|---------|
   | TypeScript/JavaScript | `typescript-lsp@claude-plugins-official` | `typescript-language-server` |
   | Python | `pyright-lsp` | `pyright-langserver` |
   | Go | `gopls-lsp` | `gopls` |
   | Rust | `rust-analyzer-lsp` | `rust-analyzer` |
   | C# | `csharp-lsp` | `csharp-ls` |
   | Java | `jdtls-lsp` | `jdtls` |
   | Kotlin | `kotlin-lsp` | `kotlin-language-server` |
   | C/C++ | `clangd-lsp` | `clangd` |
   | PHP | `php-lsp` | `intelephense` |
   | Lua | `lua-lsp` | `lua-language-server` |
   | Swift | `swift-lsp` | `sourcekit-lsp` |

2. **Ativar** (decisão humana, no `/sdd-init`): instalar o binário e `/plugin install <plugin>`.
   O kit não instala nada — é supply chain. Registre em `integrations.lsp` da config.
3. **Usar** — os agentes que implementam ou auditam código têm a ferramenta `LSP` em `tools` e o
   protocolo "LSP antes de varredura": localizar definição/referências e ler diagnósticos depois de
   editar. O guardião cita símbolos (`UsersService.remove`) como evidência de implementação.
4. **Verificar** — `sdd doctor --project` avisa quando há linguagem detectada sem code intelligence
   habilitado, binário ausente ou plugin não declarado.

## Fallback

| Situação | O que acontece |
|----------|----------------|
| Plugin/binário ausente | a ferramenta `LSP` não existe na sessão; os agentes usam Glob/Grep/Read com escopo (paths da config) |
| Linguagem sem plugin oficial (Ruby, Elixir, Scala, Dart...) | Grep/Read; opcionalmente **Serena** |
| Repositório enorme | subagente de exploração (somente leitura) antes de editar, para não inflar o contexto |

## Serena

[Serena](https://github.com/oraios/serena) oferece navegação semântica via MCP para vários clientes.
No kit ela é **opcional**, nunca parte do core:

- use quando o LSP nativo não cobre a linguagem, ou quando o time precisa da mesma navegação em outro
  cliente (Codex, OpenCode, Cline);
- entra como servidor MCP pelo processo normal de governança (allowlist + lock, Fase 10), com
  versão fixada;
- não substitui o LSP nativo onde ele existe.
