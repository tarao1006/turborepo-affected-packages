# turborepo-affected-packages

This action retrieves modified packages in a monorepo using [Turborepo](https://turbo.build/repo/docs). It utilizes `turbo ls --affected` and `turbo query`. For details on each command, please refer to the official documentation:

- [ls](https://turbo.build/repo/docs/reference/ls)
- [query](https://turbo.build/repo/docs/reference/query)

## Usage

> [!IMPORTANT]  
> When using `turbo ls --affected`, you can specify the base branch (or commit) and head branch (or commit) directly via environment variables (see [Documentation](https://turbo.build/repo/docs/reference/ls#--affected)).
>
> When running on GitHub Actions, an error will occur unless these values are explicitly specified (see [--affected failing to resolve main even on full checkout](https://github.com/vercel/turborepo/issues/9320)).
>
> To avoid this issue, it is recommended to retrieve the base commit and head commit using [tarao1006/base-and-head](https://github.com/tarao1006/base-and-head), as shown in the example below.

```yaml
jobs:
  check-affected-packages:
    runs-on: ubuntu-latest
    outputs:
      tasks: ${{ steps.check.outputs.tasks }}
      affected-packages: ${{ steps.check.outputs.affected-packages }}
    steps:
      - uses: actions/checkout@v4

      # Detect base and head commits and fetch them.
      # It is recommended that you use this action to ensure Turborepo works properly.
      - id: get-base-and-head
        uses: tarao1006/base-and-head@v0
      - run: |
          git fetch origin --depth=${{ steps.get-base-and-head.outputs.depth }} \
            ${{ steps.get-base-and-head.outputs.base }} \
            ${{ steps.get-base-and-head.outputs.head }}

      - uses: tarao1006/turborepo-affected-packages@v0
        id: check
        env:
          # You can pass the base and head commits to the action via environment variables.
          # For more details, please refer to the documentation: https://turbo.build/repo/docs/reference/ls#--affected
          TURBO_SCM_BASE: ${{ steps.get-base-and-head.outputs.base }}
          TURBO_SCM_HEAD: ${{ steps.get-base-and-head.outputs.head }}

  # Use the outputs from check-affected-packages
  job:
    needs: check-affected-packages
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # If tests should be run
      - if: ${{ fromJson(needs.check-affected-packages.outputs.tasks).test == 'true' }}
        run: pnpm turbo run test

      # If @packages/ui is changed
      - if: ${{ contains(fromJson(needs.check-affected-packages.outputs.affected-packages), '@packages/ui') }}
        run: pnpm turbo run test
```

## Outputs

- `affected-packages` - JSON array of affected package names.

- `tasks` - Indicates whether each command needs to be executed. If a package where the command is defined has been modified, the value will be `'true'`; otherwise, it will be `'false'`. If `turbo.json` is structured as follows:

  ```json
  {
    "tasks": {
      "build": {},
      "test": {}
    }
  }
  ```

  The output will be an object where task names are the keys, and the values are 'true' or 'false', for example:

  ```json
  {
    "build": "false",
    "test": "false"
  }
  ```
