# 🧠 Skills sob medida do projeto

Skills são documentos de **perícia reutilizável** (`SKILL.md`), um por recorte do sistema. Cada
uma concentra as regras, invariantes e armadilhas de uma área para que os agentes carreguem esse
conhecimento de uma vez, em vez de redescobri-lo a cada spec.

## De onde vêm

Há **dois tipos**, e eles chegam de formas diferentes:

- **Skills de domínio** — *não* vêm prontas. São **geradas sob medida** pelo
  `@agente-gerador-skills` (via `/gerar-skills`), lendo o `specs/discovery/` e o `sdd.config.md`
  **do seu projeto**. Um e-commerce ganha `cadastro-produtos` e `marketplace`; uma clínica ganharia
  `agendamento` e `prontuario`; e o kit continua servindo qualquer domínio.
- **Packs vendorizados** (`arch-*`, `ds-*`, `uiux-*`) — *vêm prontos* com o kit, mas ficam
  **inativos por padrão**, guardados em `_packs/` (diretório ignorado como skill por começar com
  `_`). São opcionais e só entram em `.claude/skills/` quando um pack é **ativado** (por cópia).
  Assim um projeto sem design system não paga o custo de ~44 skills `ds-*` carregando
  `description` em toda sessão.

## Estrutura

```
.claude/skills/
├── _template-skill.md            ← modelo (ignorado; começa com _)
├── cadastro-produtos/SKILL.md    ← skill de domínio gerada (fica ativa aqui)
├── postgres/SKILL.md             ← skill de infra gerada (fica ativa aqui)
└── _packs/                       ← packs vendorizados, INATIVOS até ativação
    ├── arch/   (14 skills + _arch-templates/)
    ├── ds/     (44 skills + _knowledge-notes/)
    └── uiux/   (7 skills)
```

### Ativar / desativar um pack

A ativação é **mecânica**, não um flag de texto: o `/sdd-init` (ou você) **copia** o pack
escolhido de `_packs/<pack>/` para `.claude/skills/`. A partir daí o Claude Code descobre aquelas
skills normalmente. Para **desativar**, apague as pastas copiadas de `.claude/skills/` — o
original continua intacto em `_packs/`, pronto para reativar.

## Três lentes de geração

1. **Domínio** — agrupamentos de entidades + regras do `MODELO-DADOS`/`BACKLOG`.
2. **Integração** — sistemas externos/capacidades transversais da `ARQUITETURA`/`API`.
3. **Infraestrutura concreta** — a tecnologia **já decidida** na `INFRA`/config (o banco X, a
   fila Y), com as convenções daquela tecnologia — não de bancos em geral.

## Regras

- Skill descreve; a **config governa**. Não hardcode na skill o que pertence ao `sdd.config.md`.
- Toda skill traz `gerada-de:` (rastreabilidade) e uma `description` com **gatilhos** de quando
  carregá-la — é o que faz a skill certa aparecer na hora certa.
- Áreas ainda em `<TODO>` no discovery não viram skill até serem resolvidas.

---

## Skills de Design System (`ds-*`)

O pack **`ds`** (em `_packs/ds/`) é o **Design System Ops** (44 skills, adaptado de
designsystemops.com, MIT), integrado ao kit para cobrir o ciclo de vida de um design system:
auditoria de tokens, drift, cobertura de docs, acessibilidade por componente, governança,
migração, adoção, onboarding, benchmark, comunicação com stakeholders, e mais.

- **Ativação condicional:** ative este pack (copie `_packs/ds/` para `.claude/skills/`) só se o
  projeto tem/mantém um design system. Em projeto sem DS, deixe-o inativo.
- **Config unificada:** foram adaptadas para ler o nosso **`sdd.config.md` (seção 12)** em vez do
  `.ds-ops-config.yml` original. As knowledge-notes que elas citam vivem em
  `_packs/ds/_knowledge-notes/` (viajam junto na cópia de ativação).

### Mapa de campos (o que as skills chamam → onde mora na seção 12)
| Campo citado nas skills | Na seção 12 do `sdd.config.md` |
|-------------------------|-------------------------------|
| `system.name` / `framework` / `styling` / `theming` | 12.1 Identidade do DS |
| `severity.*` (hardcoded_color, tier_leakage, missing_aria...) | 12.2 Calibração de severidade |
| `gates.*` (release gates) | 12.3 Portões de release do DS |
| `integrations.*` (figma, storybook, style_dictionary, github, npm) | 12.4 Integrações |
| `recurring.*` / `docs_coverage.*` | 12.5 Relatórios recorrentes |

> Se um campo não estiver preenchido, a skill usa o default sensato dela — igual ao comportamento
> original do plugin.

---

## Skills de Arquitetura (`arch-*`)

O pack **`arch`** (em `_packs/arch/`) é o **software-architecture-skills** (14 skills +
10 templates em `_packs/arch/_arch-templates/`, MIT), para o raciocínio de decisão arquitetural que
vem **antes** de escrever o ADR: gerar opções, escrever cenários de qualidade, analisar tradeoffs,
avaliar riscos, mapear fronteiras e views (runtime/deployment).

- **Ligadas ao discovery:** o Bloco 3 do `DISCOVERY.md` aciona a cadeia
  `arch-architecture-option-generator` → `arch-quality-attribute-scenario-writer` →
  `arch-tradeoff-analysis-writer` → `arch-adr-writer`. Elas produzem o raciocínio; o resultado
  alimenta `specs/discovery/ARQUITETURA.md` (C4) e os ADRs.
- **Sem duplicação:** foram adaptadas para usar **os nossos artefatos** — `arch-adr-writer` grava
  em `specs/decisions/` com o `template-adr.md`; as views complementam o C4; as skills de
  camadas/fronteiras viram checagens do `@agente-arquiteto-guardian`.
- **Sem config:** ao contrário das `ds-*`, não leem configuração — funcionam em qualquer projeto.

> Cadeia recomendada (do `pack.yaml` original): option-generator → monolith-vs-modular →
> quality-scenarios → tradeoff → layered → service-decomposition → component-boundary →
> integration-boundary → runtime-view → deployment-view → scalability-hotspot →
> availability-strategy → risk-assessor → adr-writer.

---

## Skills de UI/UX (`uiux-*`)

O pack **`uiux`** (em `_packs/uiux/`) é o **UI/UX Pro Max** (v2.11, MIT, uupm.cc): 7 skills
(banner-design, brand, design, design-system, slides, ui-styling, e o núcleo `ui-ux-pro-max`) com
uma **base de dados consultável** — 84 estilos, 192 paletas, 74 pares de fontes, 98 diretrizes de
UX, 25 gráficos, 22 stacks.

- **Núcleo consultável via Python:** a skill `uiux-ui-ux-pro-max` roda um `search.py` sobre CSVs.
  Requer Python 3 (o `/sdd-init` libera `python`/`python3` no allowlist). Uma vez ativado o pack,
  o caminho é `.claude/skills/uiux-ui-ux-pro-max/scripts/search.py` (relativo à raiz do projeto);
  enquanto inativo, ele vive em `_packs/uiux/uiux-ui-ux-pro-max/scripts/search.py`.
- **Peso:** ~8 MB (inclui fontes `.ttf` em `ui-styling/canvas-fonts/` e os CSVs de dados). É o
  maior componente do kit — esperado, dada a base de dados embutida.

### Divisão de papéis: `uiux-*` × `ds-*` (evita competição de gatilho)
| Tarefa | Skill a usar |
|--------|--------------|
| **Criar/desenhar** UI: escolher estilo, paleta, tipografia, layout, animação | **`uiux-*`** (padrão) |
| Gerar um design system novo a partir de um brief | **`uiux-design-system`** |
| **Auditar/governar** um DS existente: drift, cobertura de docs, adoção, deprecação | **`ds-*`** |
| Acessibilidade ao **construir** um componente | `uiux-ui-ux-pro-max` (regras priorizadas) |
| Acessibilidade como **auditoria** por componente do DS | `ds-accessibility-per-component` |

> Regra prática: **`uiux-*` cria, `ds-*` governa.** Ao construir UI, comece pela search engine do
> UI/UX Pro Max; ao revisar a saúde de um design system já existente, use as `ds-*`.
