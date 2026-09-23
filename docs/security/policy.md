# Política determinística do SDD (hooks)

A política vive em **um lugar**: [`policies/sdd-policy.json`](../../policies/sdd-policy.json). Os
hooks (`scripts/hooks/sdd-hook.mjs`) a aplicam em toda chamada de ferramenta; `sdd policy check`
explica a decisão para qualquer comando ou arquivo. Nenhuma regra crítica depende só de texto em
CLAUDE.md, skill ou agente.

## Camadas (defesa em profundidade)

```text
permissions (settings.json)   → allow/deny por padrão de comando/arquivo
        ↓
PreToolUse (sdd-hook)          → policies/sdd-policy.json, segmento a segmento
        ↓
sandbox (onde suportado)       → isolamento de filesystem e rede
        ↓
execução
```

Negar `curl`/`wget` **não** bloqueia rede: `node`, `python`, `npm`, `git` também acessam. A política
só explicita intenção (`ask` para ferramentas de rede); a barreira de rede é o sandbox.

## O que os hooks garantem

| Evento | Garantia |
|--------|----------|
| `PreToolUse` | nega segredos (ler, editar, copiar, grep), edição direta de `.sdd/events.jsonl`/`state.json` e de arquivos gerados (marcador `AUTO-GENERATED` abrindo uma linha de comentário no início do arquivo), git destrutivo, `rm -r` em raiz/home/cwd/.git/.sdd, elevação de privilégio, `curl \| sh`, escrita em banco de produção; pede confirmação para instalação de dependência, ferramentas de rede, descarte de alterações, SQL destrutivo, mudanças de infra, alteração de settings/hooks/política/MCP, escrita fora do projeto, comando não analisável; nega qualquer escrita por **auditores** (`agent_type`), exceto relatórios em `.sdd/reports/` |
| `PostToolUse` | valida na hora a spec/tarefa/config editada (frontmatter, `cas` × CAs, grafo, schema) e devolve o erro ao modelo (`decision: block`) |
| `SessionStart` | informa a CLI do motor (caminho absoluto no modo plugin), a validade da config e o resumo de retomada; registra `SESSION_STARTED` |
| `SubagentStop` | impede o subagente de sair com tarefa sua `in_progress` ou (guardião) com spec em revisão sem veredito |
| `Stop` | reconcilia: spec `implementada` sem `SPEC_IMPLEMENTED`, log truncado; grava relatório da sessão |
| `SessionEnd` | registra `SESSION_FINISHED` |

## Como o comando é analisado

`scripts/lib/shell.mjs` tokeniza respeitando aspas e escapes, separa segmentos (`;`, `&&`, `||`, `|`,
`&`, quebra de linha), extrai redirecionamentos, desembrulha `sudo`/`env`/`VAR=x`/`nohup`/`timeout`/
`xargs`, e analisa recursivamente `$(...)`, crases, `<(...)`, `bash -c`, `eval`, `powershell -Command`
e `cmd /c`. Corpo de heredoc é tratado como dado. `-EncodedCommand` e aspas desbalanceadas viram `ask`.

## Ajustar por projeto (só endurece)

```yaml
security:
  protected_paths: ["dados-reais/**"]        # somam-se aos padrões de segredo
  production:
    markers: ["db-principal.interno"]        # identificam produção em comandos
    db_write: deny                            # ou ask
  destructive_git: deny                       # ou ask (push/reset --hard/clean -f); force-push é sempre deny
  network:
    mode: sandbox                             # sandbox | ask | unrestricted
    allowed_domains: ["registry.minha-empresa.com"]
```

## Falso positivo?

```bash
node scripts/sdd.mjs policy check --command "<o comando>"
node scripts/sdd.mjs policy check --tool Write --file <caminho> --agent <agente>
```

A saída cita a regra (`[bash.git.push]`, `[paths.sensitive]`...). Corrija a regra em
`policies/sdd-policy.json` com um caso de teste em `tests/unit/policies/policy.test.mjs` — nunca
desligando o hook.

## Limites conhecidos

- Código arbitrário (`node -e`, `python script.py`) pode fazer qualquer coisa que o SO permita: só o
  sandbox contém. No Windows nativo não há sandbox do Claude Code (use WSL2).
- "Mudança fora do escopo da tarefa" não é detectável de forma confiável sem declarar arquivos por
  tarefa; o kit não finge detectar.
- A política vê a linha de comando, não o efeito: um `npm run x` que apaga arquivos passa. Scripts do
  projeto são responsabilidade do projeto (revisão + sandbox).
