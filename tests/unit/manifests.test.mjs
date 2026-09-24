// Leitura de dependências por formato: só o que o manifesto declara como dependência — nunca nome
// do projeto, versão, licença ou features.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempProject, cleanup } from '../helpers.mjs';
import { manifestDependencies, tomlEntries } from '../../scripts/lib/manifests.mjs';

const depsBy = (dir) => Object.fromEntries(manifestDependencies(dir).map((m) => [m.file, m.deps]));

test('tomlEntries: seção, arrays multilinha e # dentro de string', () => {
  const e = tomlEntries('[project]\nname = "x" # nome\ndependencies = [\n  "a>=1",  # comentário\n  "b @ git+https://h/r#egg=b",\n]\n[tool."poetry".dependencies]\nc = "^1"\n');
  assert.deepEqual(e.map((x) => [x.section, x.key]), [['project', 'name'], ['project', 'dependencies'], ['tool.poetry.dependencies', 'c']]);
  assert.match(e[1].value, /git\+https:\/\/h\/r#egg=b/);
});

test('Cargo.toml: crates de todas as seções de dependência, sem versão/licença/features', () => {
  const dir = tempProject({
    'Cargo.toml': [
      '[package]', 'name = "app"', 'version = "0.1.0"', 'license = "MIT"', '',
      '[dependencies]', 'serde = "1.0"', 'tokio = { version = "1", features = ["full"] }', 'shared.workspace = true', '',
      '[dev-dependencies]', 'proptest = "1"', '',
      '[target.\'cfg(unix)\'.dependencies]', 'nix = "0.29"', '',
      '[dependencies.reqwest]', 'version = "0.12"', 'features = ["json"]', '',
      '[workspace.dependencies]', 'anyhow = "1"',
    ].join('\n'),
  });
  try {
    assert.deepEqual(depsBy(dir)['Cargo.toml'], ['anyhow', 'nix', 'proptest', 'reqwest', 'serde', 'shared', 'tokio']);
  } finally { cleanup(dir); }
});

test('go.mod: require simples e em bloco (indireto também), sem module/replace', () => {
  const dir = tempProject({
    'go.mod': 'module example.com/app\n\ngo 1.22\n\nrequire github.com/spf13/cobra v1.8.1\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n\tgolang.org/x/net v0.20.0 // indirect\n)\n\nreplace example.com/old => ../old\n',
  });
  try {
    assert.deepEqual(depsBy(dir)['go.mod'], ['github.com/gin-gonic/gin', 'github.com/spf13/cobra', 'golang.org/x/net']);
  } finally { cleanup(dir); }
});

test('pyproject: PEP 621 (com extras e grupos) e Poetry, sem nome do projeto nem python', () => {
  const dir = tempProject({
    'a/pyproject.toml': '[project]\nname = "agents"\nversion = "0.1.0"\nrequires-python = ">=3.12"\ndependencies = [\n  "langgraph>=0.4",\n  "uvicorn[standard] ; python_version >= \'3.12\'",\n]\n[project.optional-dependencies]\ndev = ["pytest"]\n[dependency-groups]\nlint = ["ruff>=0.5"]\n[build-system]\nrequires = ["hatchling"]\n',
    'b/pyproject.toml': '[tool.poetry]\nname = "svc"\n[tool.poetry.dependencies]\npython = "^3.12"\nfastapi = "^0.110"\n[tool.poetry.group.dev.dependencies]\nmypy = "*"\n',
  });
  try {
    const d = depsBy(dir);
    assert.deepEqual(d['a/pyproject.toml'], ['langgraph', 'pytest', 'ruff', 'uvicorn']);
    assert.deepEqual(d['b/pyproject.toml'], ['fastapi', 'mypy']);
  } finally { cleanup(dir); }
});

test('requirements e Pipfile: extras, marcadores, comentários e opções', () => {
  const dir = tempProject({
    'requirements-dev.txt': '# ferramentas\n-r requirements.txt\n--index-url https://x\nrequests[socks]>=2 ; python_version>"3"\nhttpx  # cliente\ngit+https://h/r#egg=foo\nblack\n',
    'Pipfile': '[[source]]\nurl = "https://pypi.org/simple"\nname = "pypi"\n[packages]\nflask = "*"\n[dev-packages]\npytest = "*"\n[requires]\npython_version = "3.12"\n',
  });
  try {
    const d = depsBy(dir);
    assert.deepEqual(d['requirements-dev.txt'], ['black', 'httpx', 'requests']);
    assert.deepEqual(d.Pipfile, ['flask', 'pytest']);
  } finally { cleanup(dir); }
});

test('package.json de .claude/ não conta; JSON inválido não quebra', () => {
  const dir = tempProject({
    '.claude/tools/x/package.json':JSON.stringify({ dependencies: { leftpad: '1' } }),
    'web/package.json': '{ inválido',
  });
  try {
    assert.deepEqual(manifestDependencies(dir), [{ file: 'web/package.json', deps: [] }]);
  } finally { cleanup(dir); }
});
