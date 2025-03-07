import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { CONFIG_DB_PATH } from "./config";

const db = new Database(CONFIG_DB_PATH);

export const getDb = () => {
  return db;
}

export const setupDb = () => {
  db.pragma('journal_mode = WAL');

  sqliteVec.load(db);

  const { sqlite_version, vec_version } = db
    .prepare(
      "select sqlite_version() as sqlite_version, vec_version() as vec_version;",
    )
    .get();

  console.log(`[storage] SQLite version: ${sqlite_version}, SQLite-vec version: ${vec_version}`);

  // Flows table that will store a set of pre-defined flows
  // that can be used to compare against the user's input

  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS flows USING vec0(
      creation_date TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      arguments TEXT,
      vector float[1536]
    )`
  );

  console.log(`[storage] Created "flows" table`);

  // Context / memory that will be used to store the user's information
  // and the context, so that it can be re-used in the future

  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS context USING vec0(
      creation_date TEXT NOT NULL,
      context TEXT,
      categories TEXT,
      vector float[1536]
    )`
  );

  console.log(`[storage] Created "context" table`);

  // Prompts will just store the prompts that the user has created

  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS prompts USING vec0(
      creation_date TEXT NOT NULL,
      prompt TEXT,
      vector float[1536]
    )`
  );

  console.log(`[storage] Created "prompts" table`);
}
