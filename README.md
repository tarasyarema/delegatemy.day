# Delegate My Day

> As if Cursor knew more than coding!

https://github.com/user-attachments/assets/36ca4ff5-74a7-4c49-b558-0dca11d305df

## Download

- Latest version: `v0.1.2`.
- Stage: `Alpha`, anything can change.

Pre-build binaries are not available yet, but you can clone the repo and run it locally, see the [Develop](#develop) section.

## Develop

### Pre-requisites

You will need API keys for

- OpenAI
- Anthropic

Once you have this, you can create a folder in `~/.dmd` and add a `config.yaml` with the following info

```yaml
keys:
  openai:
    apiKey: "<openai_key>"

  anthropic:
    apiKey: "<anthropic_key>"
```

### Setup

Just needs `npm i` to install the dependencies.

### Run

```bash
npm start
```

it might ask you to grant permissions to the app, just follow the instructions. After that you
might need to restart the terminal / app.

## Contributing

This project is in really early stages, so all contributions are welcome.

For more details see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Delegate My Day is licensed under the AGPL-3.0 License, see [LICENSE](./LICENSE) for more information.
