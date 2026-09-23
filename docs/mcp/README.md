# MCP no SDD Kit

Nenhum servidor MCP aparece num projeto em silêncio. Três arquivos do motor governam o que pode
existir; o projeto só escolhe um perfil.

```text
mcp/
├── policies/allowlist.yaml   servidores aprovados: pacote, versão fixa, comando exato, licença,
│                             rede e saída de dados (data_egress)
├── profiles/*.json           minimal · frontend · e2e · backend · database · enterprise · none
└── mcp.lock.json             ferramentas e hash do schema capturados (rug pull / tool poisoning)
```

```bash
sdd mcp profiles              # perfis e servidores aprovados
sdd mcp apply minimal         # grava .mcp.json só com a allowlist e trava o settings
sdd mcp check                 # fora da allowlist, @latest, drift de comando, auto-habilitação
sdd mcp pin context7 --consent  # captura ferramentas + hash (executa o servidor — ambiente isolado)
```

`sdd mcp apply` escreve `enableAllProjectMcpServers: false` e `enabledMcpjsonServers: [...]` no
`.claude/settings.json`: o próprio Claude Code passa a habilitar só a lista aprovada. O doctor
(`--mcp`), o SessionStart e o hook de edição (`.mcp.json` pede confirmação) cobrem o resto.

## Perfis

| Perfil | Servidores | Quando |
|--------|------------|--------|
| `minimal` | Context7 | padrão |
| `frontend` / `e2e` | Context7 + Playwright | UI navegável, validação de CAs com evidência |
| `backend` | Context7 | integrações específicas só depois de aprovadas |
| `database` | Context7 | MCP de banco só somente-leitura e nunca contra produção, se aprovado |
| `enterprise` | ContextForge | muitos MCPs com gateway central — ver [enterprise-contextforge.md](enterprise-contextforge.md) |
| `none` | — | sem MCP |

## Context7 — documentação consciente de versão

Quando a implementação depende do comportamento de uma biblioteca ou framework:

1. descubra a **versão em uso** (lockfile/manifesto);
2. prefira a documentação oficial ou o Context7 dessa versão — **não invente API**;
3. leve para o contexto só o trecho necessário;
4. nunca envie código do projeto ou segredos na consulta (`data_egress`).

Sem Context7 (perfil `none` ou serviço fora do ar), o core continua: use a documentação oficial e
registre a versão consultada.

## Playwright — evidência por critério de aceitação

Usado pelo `@agente-e2e` e pelo `/validar-e2e`. Relacione sempre:

```text
CA-07 → e2e "empréstimo sem exemplar é bloqueado" → PASS → .sdd/reports/e2e/ca-07.png
```

`--isolated` evita perfil com sessão salva; `--allowed-origins` **não** é fronteira de segurança.
Sem Playwright MCP, o e2e tradicional do projeto (`commands.e2e`) continua valendo.

## MCP Inspector

Para desenvolver, testar e depurar servidores (inclusive MCPs do próprio projeto) e para capturar o
schema no lock:

```bash
npx --yes @modelcontextprotocol/inspector@2.7.0 --cli <comando do servidor> --method tools/list --format json
```

No CI de um MCP próprio, use `--strict` para validar a portabilidade do schema. O Inspector
**executa** o servidor: rode só servidores confiáveis ou em container descartável.

## MCP Registry

O [registry oficial](https://github.com/modelcontextprotocol/registry) é fonte de **descoberta** e
metadados. Aparecer lá não aprova nada: o servidor ainda passa pela allowlist.

## Adicionar um servidor com segurança

1. Leia README, licença e o que o servidor acessa; descreva `data_egress` e `network`.
2. Fixe a versão (nunca `@latest`) e o comando exato na `allowlist.yaml`.
3. Num ambiente isolado, sem segredos desnecessários: `sdd mcp pin <nome> --consent`.
   Opcional: Snyk Agent Scan (ver [agent-scan.md](../security/agent-scan.md)).
4. Revise as descrições das ferramentas capturadas (instruções escondidas = tool poisoning).
5. Inclua o servidor num perfil, `sdd mcp apply <perfil>`, `sdd mcp check`.
6. Pin mudou numa atualização (`drift`)? Revise ferramentas novas/alteradas antes de aceitar.
