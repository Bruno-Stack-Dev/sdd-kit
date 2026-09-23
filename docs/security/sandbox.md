# Sandbox

O sandbox do Claude Code isola **filesystem e rede** dos comandos Bash. É a única camada que contém
código arbitrário (`node -e`, scripts do projeto, pacotes instalados); hooks e permissões só enxergam
a linha de comando.

## Suporte

| Plataforma | Sandbox | O que fazer |
|------------|---------|-------------|
| macOS | sim (Seatbelt, nativo) | `node scripts/sdd.mjs security sandbox --enable` |
| Linux | sim (bubblewrap; instale `bwrap` e `socat`) | idem |
| WSL2 | sim | idem, rodando o Claude Code dentro do WSL2 |
| Windows nativo | **não** | rode o Claude Code no WSL2; sem isso, valem só permissões + hooks (o doctor avisa) |

## Configuração que o kit aplica

`sdd security sandbox --enable` grava em `.claude/settings.json` (com backup em `.sdd/backup/`):

```json
"sandbox": {
  "enabled": true,
  "autoAllowBashIfSandboxed": false,
  "network": {
    "allowedDomains": ["registry.npmjs.org", "pypi.org", "files.pythonhosted.org", "github.com", "..."],
    "allowLocalBinding": true
  }
}
```

- **`autoAllowBashIfSandboxed: false`** — o sandbox soma-se às permissões; não as substitui. Quem
  quiser menos confirmações pode ligar, sabendo que passa a confiar só no isolamento.
- **Domínios** — registries de pacotes e GitHub, para instalar dependências dentro do sandbox. Acrescente
  os do projeto em `security.network.allowed_domains` na config e rode o comando de novo.
- **`allowLocalBinding: true`** — servidores de desenvolvimento e testes e2e locais continuam
  funcionando.

## Instalação de pacotes

Dentro do sandbox, a instalação só alcança os domínios liberados. Instalar dependência **nova** ainda
passa pelo `ask` da política (supply chain), com ou sem sandbox. `npm ci`/`npm install` sem argumentos
(lockfile) seguem liberados.

## Exceções

Um comando que precisa sair do sandbox (ex.: acessar um serviço interno não listado) falha; o Claude
Code pode pedir para repeti-lo fora do sandbox — **sempre com aprovação humana**. Prefira acrescentar
o domínio à config a aprovar exceções repetidas.

## Sem sandbox

Sem sandbox (Windows nativo, ambiente sem `bwrap`), o kit continua funcionando e as regras críticas
continuam determinísticas (hooks). O que se perde é a contenção de código arbitrário e da rede: trate
a aprovação de comandos `node`/`python` que executam scripts do projeto com o mesmo cuidado que uma
revisão de código.
