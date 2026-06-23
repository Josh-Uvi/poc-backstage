# Backstage Plugins

This folder contains independently versioned Backstage plugins that live in the
same GitHub repository but are intended to be built, tested, released, and
published to npm separately.

| Plugin | Package | Role | Path |
|---|---|---|---|
| RAG Chat | `@internal/backstage-plugin-rag-chat` | Frontend plugin | `plugins/rag-chat` |
| RAG Chat Backend | `@internal/backstage-plugin-rag-chat-backend` | Backend plugin | `plugins/rag-chat-backend` |

> Before publishing publicly, replace the `@internal` npm scope with the public
> npm scope you own, remove `private: true`, and update `license` from
> `UNLICENSED` to the selected open-source license in each plugin's
> `package.json`.

## Repository publishing model

The plugins use a **monorepo source layout** but a **separate npm package and
CI/CD pipeline per plugin**:

- one shared GitHub repository;
- one package directory per plugin under `plugins/*`;
- one GitHub Actions workflow per plugin;
- workflow triggers scoped by `paths` so only the affected plugin pipeline runs;
- independent npm versions, changelogs, release tags, and package ownership;
- shared root dependencies and lockfile managed by Yarn workspaces.

This keeps development simple while still allowing consumers to install only the
plugin they need:

```sh
yarn --cwd packages/app add <public-scope>/backstage-plugin-rag-chat
yarn --cwd packages/backend add <public-scope>/backstage-plugin-rag-chat-backend
```

## Preparing a plugin for public npm publishing

Complete these steps for **each plugin package** before the first public release.

### 1. Update package metadata

In the plugin's `package.json`:

```jsonc
{
  "name": "@your-scope/backstage-plugin-rag-chat",
  "version": "0.1.0",
  "license": "Apache-2.0",
  "private": false,
  "repository": {
    "type": "git",
    "url": "git+https://github.com/<owner>/<repo>.git",
    "directory": "plugins/rag-chat"
  },
  "bugs": {
    "url": "https://github.com/<owner>/<repo>/issues"
  },
  "homepage": "https://github.com/<owner>/<repo>/tree/main/plugins/rag-chat",
  "publishConfig": {
    "access": "public",
    "main": "dist/index.esm.js",
    "types": "dist/index.d.ts"
  },
  "files": ["dist"]
}
```

For backend plugins, keep the backend `publishConfig.main` entry aligned with
the generated CommonJS bundle:

```jsonc
{
  "publishConfig": {
    "access": "public",
    "main": "dist/index.cjs.js",
    "types": "dist/index.d.ts"
  }
}
```

Recommended metadata for open source:

- `description`
- `keywords`
- `author` or `contributors`
- `license`
- `repository.directory`
- `bugs.url`
- `homepage`
- `funding`

Example funding field:

```json
{
  "funding": {
    "type": "github",
    "url": "https://github.com/sponsors/Josh-Uvi"
  }
}
```

### 2. Verify the package locally

From the repository root:

```sh
yarn install --immutable
yarn workspace @your-scope/backstage-plugin-rag-chat lint
yarn workspace @your-scope/backstage-plugin-rag-chat test
yarn workspace @your-scope/backstage-plugin-rag-chat build
yarn workspace @your-scope/backstage-plugin-rag-chat pack
```

Repeat with the backend package name:

```sh
yarn workspace @your-scope/backstage-plugin-rag-chat-backend lint
yarn workspace @your-scope/backstage-plugin-rag-chat-backend test
yarn workspace @your-scope/backstage-plugin-rag-chat-backend build
yarn workspace @your-scope/backstage-plugin-rag-chat-backend pack
```

Check the generated archive before publishing:

```sh
tar -tf package.tgz
```

Only the intended package files, usually `dist`, `README.md`, `package.json`,
and license files, should be included.

### 3. Publish manually when needed

Manual publishing is useful for the first release or for validating npm access:

```sh
npm login
yarn workspace @your-scope/backstage-plugin-rag-chat npm publish --access public
```

For the backend package:

```sh
yarn workspace @your-scope/backstage-plugin-rag-chat-backend npm publish --access public
```

Use one-time passwords if your npm account requires two-factor authentication.
For automated CI publishing, prefer npm trusted publishing/provenance or an npm
automation token stored as `NPM_TOKEN` in GitHub repository secrets.

## Separate CI/CD pipelines per plugin

Create one workflow per plugin under `.github/workflows/`. Each workflow should
use path filters so it runs only when that plugin, shared configuration, or the
lockfile changes.

### Frontend plugin workflow

Example: `.github/workflows/publish-rag-chat.yml`

```yaml
name: Publish rag-chat frontend plugin

on:
  pull_request:
    paths:
      - 'plugins/rag-chat/**'
      - 'package.json'
      - 'yarn.lock'
      - '.yarnrc.yml'
      - 'tsconfig.json'
      - '.github/workflows/publish-rag-chat.yml'
  push:
    branches: [main]
    paths:
      - 'plugins/rag-chat/**'
      - 'package.json'
      - 'yarn.lock'
      - '.yarnrc.yml'
      - 'tsconfig.json'
      - '.github/workflows/publish-rag-chat.yml'

permissions:
  contents: read
  id-token: write # required for npm provenance/trusted publishing

jobs:
  validate:
    name: Validate frontend plugin
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
          cache: yarn
      - run: corepack enable
      - run: yarn install --immutable
      - run: yarn workspace @your-scope/backstage-plugin-rag-chat lint
      - run: yarn workspace @your-scope/backstage-plugin-rag-chat test
      - run: yarn workspace @your-scope/backstage-plugin-rag-chat build

  publish:
    name: Publish frontend plugin to npm
    needs: validate
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
          cache: yarn
      - run: corepack enable
      - run: yarn install --immutable
      - run: yarn workspace @your-scope/backstage-plugin-rag-chat build
      - run: yarn workspace @your-scope/backstage-plugin-rag-chat npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Backend plugin workflow

Example: `.github/workflows/publish-rag-chat-backend.yml`

```yaml
name: Publish rag-chat backend plugin

on:
  pull_request:
    paths:
      - 'plugins/rag-chat-backend/**'
      - 'package.json'
      - 'yarn.lock'
      - '.yarnrc.yml'
      - 'tsconfig.json'
      - '.github/workflows/publish-rag-chat-backend.yml'
  push:
    branches: [main]
    paths:
      - 'plugins/rag-chat-backend/**'
      - 'package.json'
      - 'yarn.lock'
      - '.yarnrc.yml'
      - 'tsconfig.json'
      - '.github/workflows/publish-rag-chat-backend.yml'

permissions:
  contents: read
  id-token: write

jobs:
  validate:
    name: Validate backend plugin
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
          cache: yarn
      - run: corepack enable
      - run: yarn install --immutable
      - run: yarn workspace @your-scope/backstage-plugin-rag-chat-backend lint
      - run: yarn workspace @your-scope/backstage-plugin-rag-chat-backend test
      - run: yarn workspace @your-scope/backstage-plugin-rag-chat-backend build

  publish:
    name: Publish backend plugin to npm
    needs: validate
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
          cache: yarn
      - run: corepack enable
      - run: yarn install --immutable
      - run: yarn workspace @your-scope/backstage-plugin-rag-chat-backend build
      - run: yarn workspace @your-scope/backstage-plugin-rag-chat-backend npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Versioning and release tags

Because each plugin is published independently, use package-specific versions
and tags:

```sh
yarn workspace @your-scope/backstage-plugin-rag-chat version patch
git tag rag-chat-v0.1.1

yarn workspace @your-scope/backstage-plugin-rag-chat-backend version patch
git tag rag-chat-backend-v0.1.1
```

Recommended tag format:

- `rag-chat-vX.Y.Z`
- `rag-chat-backend-vX.Y.Z`

If the frontend and backend must stay compatible, document the compatibility
matrix in both plugin READMEs and release notes.

## npm publishing checklist

Use this checklist for every release:

- [ ] Confirm the plugin package name uses the public npm scope.
- [ ] Confirm `private` is removed or set to `false`.
- [ ] Confirm `license` is an open-source SPDX identifier.
- [ ] Confirm `README.md`, `repository`, `bugs`, `homepage`, and `funding` are set.
- [ ] Run `yarn install --immutable`.
- [ ] Run plugin-specific `lint`, `test`, and `build`.
- [ ] Confirm the generated package contents with `yarn workspace <package> pack`.
- [ ] Bump only the package version being released.
- [ ] Publish only from the plugin-specific workflow or matching manual command.
- [ ] Create a plugin-specific GitHub release/tag.

## Adding a new plugin

From the repository root:

```sh
yarn new
```

Then:

1. create the plugin under `plugins/<plugin-name>`;
2. add package metadata suitable for npm publishing;
3. add a plugin-specific README;
4. add a plugin-specific GitHub Actions workflow with `paths` filters;
5. verify the package with `lint`, `test`, `build`, and `pack`;
6. publish it as its own npm package.

You can also check out existing plugins on the
[Backstage plugin marketplace](https://backstage.io/plugins).

## Contribution guide

Contributions are welcome. This repository is intended to be open sourced, so
please keep changes focused, documented, and easy to review.

### How to contribute

1. Fork the repository.
2. Create a branch from `main`:

   ```sh
   git checkout -b feat/rag-chat-my-change
   ```

3. Install dependencies:

   ```sh
   yarn install --immutable
   ```

4. Make your change in the relevant plugin folder.
5. Run the checks for the plugin you changed:

   ```sh
   yarn workspace <package-name> lint
   yarn workspace <package-name> test
   yarn workspace <package-name> build
   ```

6. Update documentation and tests when behaviour changes.
7. Open a pull request with:
   - a clear description of the change;
   - linked issue or discussion, if applicable;
   - screenshots or API examples for user-facing changes;
   - notes about breaking changes or migration steps.

### Contribution standards

- Keep frontend changes inside frontend plugin boundaries.
- Keep backend/service changes inside backend plugin boundaries.
- Do not commit secrets, API tokens, generated credentials, or local `.env`
  files.
- Prefer small pull requests over large mixed-scope changes.
- Add or update tests for bug fixes and new features.
- Follow the existing Backstage, TypeScript, linting, and formatting patterns.
- Keep public APIs backward compatible unless a breaking change is clearly
  documented.

### Reporting issues

When opening an issue, include:

- plugin name and version;
- Backstage version;
- Node.js and package manager versions;
- relevant configuration with secrets removed;
- reproduction steps;
- expected and actual behaviour;
- logs or screenshots where useful.

## Sponsorship

If these plugins help your team, please consider sponsoring ongoing maintenance:

[Sponsor this project on GitHub](https://github.com/sponsors/Josh-Uvi)

Sponsorship helps fund maintenance, security updates, documentation, examples,
and new Backstage plugin features.
