# Atribuição — UI/UX Pro Max

As pastas com prefixo `uiux-*` (em `.claude/skills/`) derivam do pacote **UI/UX Pro Max**
(v2.11.0) de NextLevelBuilder — https://uupm.cc ·
https://github.com/nextlevelbuilder/ui-ux-pro-max-skill — licença **MIT**.

Adaptações feitas para integração ao SDD Kit:
- Prefixo `uiux-` nas pastas de skill.
- Paths do `search.py` reescritos de `${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/` para
  `.claude/skills/uiux-ui-ux-pro-max/` (relativo à raiz do projeto onde o kit é colado).
- `python`/`python3` adicionados ao allowlist do `.claude/settings.json`.
- Divisão de papéis com as skills `ds-*`: `uiux-*` cria/desenha UI; `ds-*` governa/audita DS.

O conteúdo original das skills, scripts, dados (CSVs) e fontes é preservado. A licença MIT
original (ver LICENSE do repositório de origem) se aplica a esse material derivado.
