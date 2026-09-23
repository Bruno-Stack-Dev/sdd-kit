---
name: ai-security-reviewer
description: "Revisa a segurança de uma aplicação de IA: prompt injection direta e indireta, agência excessiva, vazamento de dados e de prompt, envenenamento de RAG/memória, ferramentas e servidores MCP de terceiros, execução de código gerado (sandbox), guardrails de entrada e saída e red teaming — com modelo de ameaças, controles determinísticos e ferramentas verificadas na documentação atual (ex.: Promptfoo red team, Garak, NeMo Guardrails, sandboxes como E2B). Acione quando pedirem: segurança do LLM, prompt injection, guardrails, red team, o agente executa código, jailbreak, o modelo pode vazar dados."
license: MIT
metadata:
  sdd-pack: "ai"
  sdd-version: "3.0.0"
---

# ai-security-reviewer

Método obrigatório: [AVALIACAO-DE-TECNOLOGIA.md](../_ai-references/AVALIACAO-DE-TECNOLOGIA.md).
Saída: `specs/discovery/AI-SECURITY.md` (← `../_ai-templates/AI-SECURITY.md`).

## Princípio

**O modelo não é uma fronteira de segurança.** Instruções no prompt ("não revele", "não execute")
reduzem risco, mas não o controlam. Controles reais são determinísticos e ficam fora do modelo:
permissões, validação, isolamento, gates. Use listas públicas de riscos para LLMs (ex.: OWASP Top
10 para aplicações LLM, na versão atual) como checklist, não como teto.

## 1. Modelo de ameaças

Para cada fluxo de IA, desenhe: **fontes de entrada** (usuário, documentos, web, e-mail, respostas
de ferramentas, outros agentes), **o que o modelo pode fazer** (ferramentas, dados acessíveis) e
**para onde a saída vai** (usuário, código, banco, outro sistema). Todo texto que o modelo lê é
entrada potencialmente hostil.

## 2. Ameaças e controles

| Ameaça | Controles determinísticos |
|--------|---------------------------|
| Prompt injection direta e indireta (documento/página/resposta de ferramenta com instruções) | separar dados de instruções; menor privilégio; ação sensível exige gate fora do modelo; não dar a um fluxo que lê conteúdo não confiável ferramentas de efeito colateral sem aprovação |
| Agência excessiva | lista fechada de ferramentas por agente; escopo e credencial por ferramenta; limites de valor/volume/passos; `human_gates` para irreversível |
| Vazamento de dados (entre usuários, de segredos, de prompt) | filtragem por permissão na recuperação; segredos nunca no prompt; redação de PII na saída e nos logs; isolamento por tenant em memória e cache |
| Saída insegura consumida por código | validação por schema; escapar/sanitizar antes de renderizar ou executar; nunca `eval` de saída |
| Envenenamento de RAG/memória | validação na ingestão; proveniência por chunk; memória não aceita conteúdo não confiável sem validação |
| Ferramentas/servidores MCP de terceiros | allowlist, versão fixada, revisão das descrições de ferramenta, scan em ambiente isolado; mesmo processo do kit (`docs/mcp/`, `docs/security/agent-scan.md`) |
| Execução de código gerado | sandbox isolado sem credenciais, rede restrita, tempo/memória limitados, sistema de arquivos efêmero |
| Negação de carteira (custo) | limites de tokens, passos e taxa por usuário; alertas de custo |

## 3. Guardrails

Guardrails de entrada/saída (classificadores, regras, frameworks como NeMo Guardrails — verifique a
versão atual) são **camada adicional**, não substituto dos controles acima. Meça falso positivo e
falso negativo com eval antes de ativar em produção.

## 4. Sandbox para código gerado

Opções a comparar: container/VM efêmera própria, sandbox do sistema operacional, serviços de
sandbox remoto (ex.: E2B). Critérios: isolamento real (kernel compartilhado?), rede, tempo de
início, custo, **para onde vão o código e os dados** (serviço remoto = dados saem do ambiente;
exige aprovação conforme `AI-DATA-GOVERNANCE.md`).

## 5. Red teaming

- Casos adversariais versionados entram no `AI-EVALS.md` e rodam como regressão.
- Ferramentas a verificar: Promptfoo (red team), Garak, e similares. Rode **contra ambiente de teste
  isolado**, com consentimento, nunca contra produção ou serviços de terceiros sem autorização.
- Resultado não executado é `NOT_RUN`, nunca "aprovado".

## Qualidade

- Todo fluxo tem fontes de entrada, capacidades e destinos mapeados; toda ferramenta com efeito
  colateral tem gate e escopo.
- Nenhum controle crítico depende só de instrução no prompt.
- Casos adversariais versionados e rodando como regressão; scanners/red team só em isolamento.
