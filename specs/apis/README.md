# 📡 Contratos de API executáveis

Enquanto `specs/discovery/API.md` é o resumo **humano** da API, esta pasta guarda o contrato
**executável** — tipicamente um `openapi.yaml`. Ele é a fonte da verdade que backend e frontend
consomem, e contra o qual o `@agente-spec-guardian` valida respostas (portão da config seção 11).

## Por quê executável

Documentação em prosa diverge do código com o tempo. Um contrato OpenAPI:
- **gera tipos** para os dois lados (o `@agente-arquiteto-contratos` deriva daqui);
- **valida request/response** em teste/runtime (o `@agente-backend` se conforma a ele);
- **alimenta o CI** (o `@agente-devops` roda a validação de conformidade no pipeline).

## Fluxo

1. Discovery preenche `API.md` (visão humana dos endpoints).
2. O arquiteto materializa/atualiza `openapi.yaml` aqui (camada B1 do pipeline, config 5-B).
3. Backend implementa conforme; testes de integração validam contra este arquivo.
4. Ativado o portão "Conformidade de contrato" (config seção 11), o guardião/CI checa que as
   respostas batem com o schema.

> Projeto mock-first sem API real: deixe esta pasta vazia; o contrato passa a existir quando o
> backend entrar (config seção 1 muda de estágio).
