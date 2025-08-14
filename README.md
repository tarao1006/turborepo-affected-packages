# turborepo-affected-packages

This action retrieves modified packages in a monorepo using [Turborepo](https://turbo.build/repo/docs). It utilizes `turbo ls --affected` and `turbo query`. For details on each command, please refer to the official documentation:

- [ls](https://turbo.build/repo/docs/reference/ls)
- [query](https://turbo.build/repo/docs/reference/query)

## Inputs

- `turbo-config-file` (optional) - Path to the Turbo configuration file. Defaults to `turbo.json`.
- `packages-or-tasks-yaml` (optional) - YAML configuration for packages or tasks dependencies. This allows you to define custom conditions based on affected packages or tasks.

## Usage

> [!IMPORTANT]  
> When using `turbo ls --affected`, you can specify the base branch (or commit) and head branch (or commit) directly via environment variables (see [Documentation](https://turbo.build/repo/docs/reference/ls#--affected)).
>
> When running on GitHub Actions, an error will occur unless these values are explicitly specified (see [--affected failing to resolve main even on full checkout](https://github.com/vercel/turborepo/issues/9320)).
>
> To avoid this issue, it is recommended to retrieve the base commit and head commit using [tarao1006/base-and-head](https://github.com/tarao1006/base-and-head), as shown in the example below.

```yaml
jobs:
  check-affected-packages-and-tasks:
    runs-on: ubuntu-latest
    outputs:
      deploy-frontend: ${{ steps.check.outputs.deploy-frontend_affected }}
      deploy-backend: ${{ steps.check.outputs.deploy-backend_affected }}
      test: ${{ steps.check.outputs.test_affected }}
      lint: ${{ steps.check.outputs.lint_affected }}
    steps:
      - uses: actions/checkout@v4

      # Detect base and head commits and fetch them.
      - id: get-base-and-head
        uses: tarao1006/base-and-head@v0
      - run: |
          git fetch origin --depth=${{ steps.get-base-and-head.outputs.depth }} \
            ${{ steps.get-base-and-head.outputs.base }} \
            ${{ steps.get-base-and-head.outputs.head }}

      - uses: tarao1006/turborepo-affected-packages@v0
        id: check
        with:
          packages-or-tasks-yaml: |
            deploy-frontend:
              - "@packages/frontend" # package name
            deploy-backend:
              - "@packages/backend"
            test:
              - "test" # task name
            lint:
              - "lint"
        env:
          TURBO_SCM_BASE: ${{ steps.get-base-and-head.outputs.base }}
          TURBO_SCM_HEAD: ${{ steps.get-base-and-head.outputs.head }}

  deploy-frontend:
    needs: check-affected-packages-and-tasks
    runs-on: ubuntu-latest
    if: ${{ needs.check-affected-packages-and-tasks.outputs.deploy-frontend_affected == 'true' }}
    steps:
      - run: echo "Deploying frontend..."

  deploy-backend:
    needs: check-affected-packages-and-tasks
    runs-on: ubuntu-latest
    if: ${{ needs.check-affected-packages-and-tasks.outputs.deploy-backend_affected == 'true' }}
    steps:
      - run: echo "Deploying backend..."

  test:
    needs: check-affected-packages-and-tasks
    runs-on: ubuntu-latest
    if: ${{ needs.check-affected-packages-and-tasks.outputs.test_affected == 'true' }}
    steps:
      - uses: actions/checkout@v4
      - run: pnpm turbo run test

  lint:
    needs: check-affected-packages-and-tasks
    runs-on: ubuntu-latest
    if: ${{ needs.check-affected-packages-and-tasks.outputs.lint_affected == 'true' }}
    steps:
      - uses: actions/checkout@v4
      - run: pnpm turbo run lint
```

## Outputs

- `affected-packages` - JSON array of affected package names.

- `affected-tasks` - JSON array of affected task names.

- **Individual task outputs** - For each task defined in `turbo.json`, an individual output is created with the task name followed by "_affected" as the key. The value will be `'true'` if any package containing that task is affected, otherwise `'false'`. For example, if `turbo.json` has tasks `build` and `test`, the following outputs will be available:
  - `build_affected` - `'true'` or `'false'`
  - `test_affected` - `'true'` or `'false'`

- **Custom YAML configuration outputs** - If `packages-or-tasks-yaml` input is provided, additional outputs will be created based on the YAML configuration. For each key in the YAML, an output named `{key}_affected` will be created with a value of `'true'` or `'false'` indicating whether any of the specified packages or tasks are affected.

### Example Outputs

For a `turbo.json` with the following structure:

```json
{
  "tasks": {
    "build": {},
    "test": {},
    "lint": {}
  }
}
```

And a `packages-or-tasks-yaml` input like:

```yaml
frontend:
  - "@packages/ui"
  - "@packages/frontend"
backend:
  - "@packages/backend"
  - "build"
```

The outputs would include:

- `affected-packages`: `["@packages/ui", "@packages/frontend", "@packages/backend"]`
- `affected-tasks`: `["build", "test"]`
- `build_affected`: `"true"`
- `test_affected`: `"true"`
- `lint_affected`: `"false"`
- `frontend_affected`: `"true"`
- `backend_affected`: `"true"`
