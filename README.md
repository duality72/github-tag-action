# GitHub Tag Action

A GitHub Action to automatically bump and tag master, on merge, with a new version. This action is based on mathieudutour/github-tag-action, but has been heavily modified for Affirm-specific use. The documentation has been updated, but some elements of the old documentation may have been missed. 

## Usage

```yaml
name: Bump version
on:
  push:
    branches:
      - master
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: Affirm/actions/external/checkout@master
      - name: Bump version and push tag
        uses: Affirm/actions/github-tag-action@master
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          deployable_target: ${{ github.event.inputs.dt_name }}
```

### Inputs

- **github_token** _(required)_ - Required for permission to tag the repo. Usually `${{ secrets.GITHUB_TOKEN }}`.
- **deployable_target** _(required)_ - Required to determine which DT version to bump.
- **dry_run** _(optional)_ - Do not perform taging, just calculate next version, then exit

### Outputs

- **new_tag** - The value of the newly created tag.
- **new_version** - The value of the newly created tag without the prefix.
- **previous_tag** - The value of the previous tag (or `<DT>-v0.0.0` if none).

> **_Note:_** This action creates a [lightweight tag](https://developer.github.com/v3/git/refs/#create-a-reference) by default.

## Credits

[mathieudutour/github-tag-action](https://github.com/mathieudutour/github-tag-action) - a similar action that this action is based on
