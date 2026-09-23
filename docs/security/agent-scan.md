# Scan de MCP e skills (Snyk Agent Scan)

[Snyk Agent Scan](https://github.com/snyk/agent-scan) (sucessor do `mcp-scan`) procura tool poisoning,
prompt injection em descrições de ferramentas, capacidades suspeitas e mudanças inesperadas em
configurações MCP e skills. No kit ele é **opcional** e nunca roda sozinho.

## O que ele faz de sensível

- **Inicia os servidores MCP stdio** do arquivo analisado (executa os comandos do `.mcp.json`).
- **Envia à API da Snyk** detalhes do agente, configs MCP, nomes/descrições de ferramentas e conteúdo
  de skills (com redação de segredos pela ferramenta).
- Exige `SNYK_TOKEN`.

## Política

1. Rode só com **duas confirmações explícitas**: `sdd scan agents --consent --run-mcp-servers`.
   `--consent` autoriza o envio à API da Snyk; `--run-mcp-servers` autoriza a ferramenta a executar os
   servidores MCP stdio do alvo (em modo `--ci` ela exige `--dangerously-run-mcp-servers`, que o kit
   só passa com essa confirmação). Sem qualquer uma delas, sem `SNYK_TOKEN` ou sem `uvx`, o resultado
   é `NOT_RUN` e nada é executado.
2. Configuração **não confiável** (PR de terceiro, template baixado) só dentro de container
   descartável, sem credenciais além do `SNYK_TOKEN`:

   ```bash
   docker run --rm -it -e SNYK_TOKEN -v "$PWD:/repo:ro" -w /repo ghcr.io/astral-sh/uv:python3.12-bookworm-slim \
     uvx snyk-agent-scan@0.6.4 scan /repo/.mcp.json --json --ci --dangerously-run-mcp-servers
   ```

3. Versão fixada (`snyk-agent-scan@0.6.4`); atualizar é mudança revisada.
4. O kit guarda a saída **crua** em `.sdd/reports/agent-scan-*.json` e usa só o exit code do modo
   `--ci` (o formato JSON muda entre versões — nenhum CI do kit depende de campos dele).
5. Resultado é **best-effort**: "sem achados" não prova segurança. Achado = revisar o servidor/skill,
   não "suprimir".

## Onde entra

| Momento | Ferramenta |
|---------|------------|
| Sempre (offline, determinístico) | `sdd mcp check`, `sdd skills verify`, scan estático de skills |
| Ao aprovar servidor/skill novo | `sdd mcp pin --consent`, `sdd skills scan --external`, **agent-scan** |
| CI | workflow manual (`workflow_dispatch`) com `SNYK_TOKEN` como secret; nunca em PRs de fork |

O doctor mostra o último resultado (`scanner.agent-scan`) ou `NOT_RUN`.
