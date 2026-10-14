# Contributing

Follow the [README](README.md) to install dependencies and run the demo.

Before opening a pull request:

```sh
bun run generate
bun run check
```

Commit regenerated clients after changing actor methods or socket types. Do not
edit `generated/` by hand. When changing dependencies, run `bun install` and commit
both `package.json` and `bun.lock`.

Keep credentials, logs, and local chat data out of commits and issue reports.
Report runtime or SDK bugs in the
[Durable Actors repository](https://github.com/TerseAI/durable-actors).
