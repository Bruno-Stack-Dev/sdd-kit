# Método de avaliação de tecnologia de IA (pack `ai`)

O ecossistema de IA muda em semanas. Por isso este pack **não traz tabela de recomendação fixa**:
ensina a decidir e exige evidência atual. Toda skill `ai-*` segue este método.

## 1. Problema antes da tecnologia

Antes de qualquer framework, responda por escrito:

1. **Precisa de IA?** Uma regra, um índice de busca ou um formulário resolvem? Se sim, pare aqui.
2. **Precisa de agente?** Um *workflow* determinístico com uma ou poucas chamadas de modelo em pontos
   fixos costuma ser mais barato, testável e seguro do que um agente autônomo. Autonomia (o modelo
   decide o próximo passo e as ferramentas) só se justifica quando o caminho não é conhecido de
   antemão **e** o custo de erro é tolerável ou há gate humano.
3. **Qual é o risco se o modelo errar?** (informativo → sugestão revisada → ação com efeito
   colateral → ação irreversível). O risco define o nível de avaliação, guardrail e gate humano.

## 2. Alternativas — sempre mais de uma

Compare **pelo menos duas** alternativas reais, e inclua sempre a opção de base:

- **Sem framework / o mínimo**: SDK oficial do provedor + código próprio.
- Uma ou mais bibliotecas/serviços candidatos.

Nomes citados nas skills são **exemplos de candidatos a verificar**, não recomendação. Candidatos
novos podem ser melhores que os citados — procure.

## 3. Verificar documentação atual (obrigatório)

Nunca decida por memória do modelo nem por post antigo. Para cada candidato:

- Consulte a **documentação oficial atual** (Context7 MCP, se o perfil estiver ativo:
  `resolve-library-id` → `query-docs`; senão, o site oficial e o repositório).
- Registre: **versão avaliada, data da consulta, link**; data do último release; licença;
  cadência de releases e sinais de manutenção (issues respondidas, mantenedores).
- Confirme que a funcionalidade que você pretende usar existe **nessa versão** (APIs de agentes,
  memória e structured output mudam com frequência).
- O que não puder verificar fica marcado `NÃO VERIFICADO` no artefato — nunca vira fato.

## 4. Critérios (pondere pelos drivers do projeto)

Os pesos vêm dos drivers do discovery (`specs/discovery/`) e do bloco `ai:` da config — não de
preferência pessoal.

| Critério | Pergunta |
|----------|----------|
| Aderência | Resolve o problema declarado sem forçar a arquitetura? |
| Maturidade e manutenção | Releases recentes? Quantos mantenedores? API estável? |
| Licença | Compatível com o uso (comercial, SaaS, distribuição)? Partes com licença diferente? |
| Portabilidade / lock-in | Usa padrões abertos (MCP, OpenTelemetry, APIs compatíveis entre provedores)? Qual o custo de sair? |
| Segurança | Executa código? Acessa rede/arquivos? Isolamento? Superfície de prompt injection? Supply chain? |
| Dados | Onde os dados trafegam e ficam? Residência, PII, retenção, uso para treino pelo provedor? |
| Operação | Gerenciado × self-host; custo (tokens, GPU, licença); latência; escala; SLA |
| Observabilidade | Traces por chamada/ferramenta? Exporta OTel? |
| Testabilidade | Dá para rodar evals determinísticas e com modelo? Dá para simular o modelo em teste? |
| Time | O time consegue operar e depurar? Curva de aprendizado? |

## 5. Prova pequena quando o risco justifica

Para decisões caras de reverter (framework de agentes, banco vetorial, serving próprio), faça um
spike curto **com eval**: o mesmo conjunto de casos rodado nas alternativas, com métrica definida
antes. Sem eval, a comparação é opinião.

## 6. Registrar a decisão

Registre em ADR do projeto (`sdd template show adr` → `specs/decisions/ADR-NNN-<slug>.md`; com o
pack `arch` ativo, use `arch-adr-writer`). O ADR traz:

- problema e drivers; alternativas avaliadas (incluindo a opção mínima);
- critérios com pesos e a evidência de cada nota (link + versão + data);
- decisão, consequências e riscos aceitos;
- **gatilhos de reavaliação** (ex.: "revisar se o custo por requisição passar de X", "revisar a
  cada release major do framework", "revisar em 6 meses").

## 7. O que o kit nunca faz

- Não instala framework de IA no projeto nem no core do kit. A dependência entra no projeto por
  decisão registrada, pelo gerenciador de pacotes do próprio projeto.
- Não envia código ou dados do projeto a serviços externos para "avaliar" um candidato sem
  autorização explícita.
- Não habilita scanner, red team ou sandbox remoto sem consentimento e ambiente isolado.
