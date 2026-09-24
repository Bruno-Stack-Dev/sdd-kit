# Método de avaliação de ferramentas (radar-ferramentas)

Ferramentas mudam mais rápido do que qualquer kit. Por isso o radar **não traz tabela de
recomendação**: ensina a comparar e exige evidência atual. Para decisões de IA (frameworks de
agentes, modelos, serving, RAG, memória) o pack `ai` tem a versão especializada deste método em
`_packs/ai/_ai-references/AVALIACAO-DE-TECNOLOGIA.md`.

## 1. Lacuna antes da ferramenta

Para cada lacuna, responda por escrito antes de procurar nomes:

1. **Qual driver ela atende?** RNF, restrição de INFRA, risco, custo, prazo. Sem driver, não é
   lacuna — é preferência.
2. **A stack atual ou código próprio resolvem?** Se uma função de 30 linhas, a biblioteca padrão
   ou algo já instalado resolve, essa é a **opção mínima** e entra na comparação.
3. **Qual o custo de errar?** Trocar um formatador é barato; trocar framework, banco ou serving é
   caro. O custo define se precisa de spike.

## 2. Alternativas — sempre mais de uma

Compare a opção mínima com **pelo menos um** candidato real (dois ou mais quando a decisão é cara).
Nomes citados em qualquer skill do kit são **candidatos a verificar**, nunca recomendação.
Candidatos novos podem ser melhores que os conhecidos — procure.

## 3. Evidência atual (obrigatória)

Para cada candidato, na documentação oficial ou no repositório (Context7 quando o perfil MCP
estiver ativo):

- versão avaliada, data da consulta e link;
- licença (e partes com licença diferente: "open core", modelos, plugins);
- data do último release, cadência e sinais de manutenção (issues respondidas, mantenedores);
- a funcionalidade que interessa existe **nessa versão**, na linguagem e no runtime do projeto;
- compatibilidade com as restrições eliminatórias (ex.: roda 100% local? precisa de conta/cloud?).

O que não puder ser verificado fica `NÃO VERIFICADO` no radar — nunca vira fato.

## 4. Critérios (pesos pelos drivers)

Pesos de 1 a 5, justificados pelos drivers do discovery — não por preferência.

| Critério | Pergunta |
|----------|----------|
| Aderência | Resolve a lacuna sem forçar a arquitetura? |
| Compatibilidade | Linguagem, versão de runtime, SO, stack e restrições eliminatórias? |
| Maturidade e manutenção | Releases recentes? Mais de um mantenedor? API estável? |
| Licença | Compatível com o uso (comercial, SaaS, distribuição, on-premise)? |
| Lock-in / portabilidade | Padrões abertos? Qual o custo de sair? |
| Segurança e supply chain | Executa código, acessa rede ou arquivos? Dependências transitivas? Histórico de CVEs? |
| Dados | Envia dados a terceiros? Retenção, residência, uso para treino? |
| Operação e custo | Self-host × gerenciado; custo (licença, infra, GPU, tokens); o time consegue operar? |
| Observabilidade e testabilidade | Dá para rastrear, testar e simular em teste? |

## 5. Spike quando o risco justifica

Decisão cara de reverter → spike curto: os mesmos casos rodados na opção mínima e nos candidatos,
com métrica e critério de corte definidos **antes**. Sem isso, a comparação é opinião.

## 6. Registrar

A decisão é do humano. Adotar → ADR `proposto` do projeto (`sdd template show adr`; com o pack
`arch`, `arch-adr-writer`) com problema e drivers, alternativas (incluindo a mínima), critérios com a
evidência de cada nota, consequências e **gatilhos de reavaliação**. Adiar ou descartar também
fica registrado no radar, com o motivo.

## 7. O que o radar nunca faz

- Não instala nada nem edita manifestos; a dependência entra depois, pelo gerenciador de pacotes do
  projeto, e a política do kit pede confirmação.
- Não envia código, nomes internos ou dados do projeto nas buscas.
- Não delega a pesquisa a agentes (nenhum tem web, por ADR-0009).
- Não cria ADR `aceito`, nem muda a config ou o backlog sem a decisão do humano.
