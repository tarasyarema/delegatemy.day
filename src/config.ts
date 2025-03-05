import fs from 'fs';
import yaml from 'yaml';
import { homedir } from 'os';
import path from 'path';

type Config = {
  keys?: {
    [key: string]: {
      apiKey: string;
    }
  }
}

// TODO
export const CONFIG_PATH = path.join(homedir(), '.dmd');
export const CONFIG_TMP_PATH = path.join(CONFIG_PATH, 'tmp');
export const CONFIG_DB_PATH = path.join(CONFIG_PATH, 'db.sqlite');
export const CONFIG_FILE_PATH = path.join(CONFIG_PATH, 'config.yaml');

export const getConfig = (): Config => {
  let config: Config = {};

  try {
    const file = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
    config = yaml.parse(file);
  } catch (e) {
    console.error(`Could not read config file: ${e}`);
  }

  return config;
}

export const setupConfig = () => {
  // Make sure the config directory exists
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.mkdirSync(CONFIG_PATH, { recursive: true });
  } else {
    console.log('Config directory already exists');
  }

  // Ensure the `config.yaml` file exists and a `tmp` folder exists in there too
  if (!fs.existsSync(path.join(CONFIG_PATH, 'config.yaml'))) {
    fs.writeFileSync(path.join(CONFIG_PATH, 'config.yaml'), '');
  } else {
    console.log('Config file already exists');
  }

  if (!fs.existsSync(path.join(CONFIG_PATH, 'tmp'))) {
    fs.mkdirSync(path.join(CONFIG_PATH, 'tmp'));
  } else {
    console.log('Temp directory already exists');
  }
}

