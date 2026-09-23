# Atribuição — UI/UX Pro Max

As pastas com prefixo `uiux-*` (em `.claude/skills/`) derivam do pacote **UI/UX Pro Max**
(v2.11.0) de NextLevelBuilder — https://uupm.cc ·
https://github.com/nextlevelbuilder/ui-ux-pro-max-skill — licença **MIT**.

Adaptações feitas para integração ao SDD Kit:
- Prefixo `uiux-` nas pastas de skill.
- Paths do `search.py` reescritos de `${CLAUDE_PLUGIN_ROOT}/.claude/skills/uiux-ui-ux-pro-max/` para
  `.claude/skills/uiux-ui-ux-pro-max/` (relativo à raiz do projeto onde o kit é colado).
- `python`/`python3` adicionados ao allowlist do `.claude/settings.json`.
- Divisão de papéis com as skills `ds-*`: `uiux-*` cria/desenha UI; `ds-*` governa/audita DS.

O conteúdo original das skills, scripts, dados (CSVs) e fontes é preservado. A licença MIT
original (ver LICENSE do repositório de origem) se aplica a esse material derivado, **com duas
exceções registradas na v3 do SDD Kit** (ver `THIRD_PARTY.md` na raiz do kit):

- `uiux-ui-styling/` declara `license: MIT` no frontmatter, mas traz `LICENSE.txt` **Apache-2.0**;
  trate essa skill como Apache-2.0 até a origem esclarecer.
- `uiux-ui-styling/canvas-fonts/` contém fontes sob **SIL Open Font License 1.1** (um `*-OFL.txt` por
  família).

Risco registrado: os scripts `uiux-design/scripts/{cip,icon,logo}/generate.py` carregam variáveis de
arquivos `.env` (da pasta da skill e de `~/.claude/`) e enviam prompts à API Gemini do Google
(serviço externo, exige `GEMINI_API_KEY`). Não os execute com segredos que não queira expor a esse
serviço.
