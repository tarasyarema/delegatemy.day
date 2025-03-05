# Delegate My Day

## Develop

### Pre-requisites

You will need API keys for

- OpenAI
- Anthropic

and also a license of [`nutjs`](https://nutjs.dev/), which then you can follow [this guide]() to configure.

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
