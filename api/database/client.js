import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_FILE || path.resolve(__dirname, 'encuestas_pymes.sqlite');

sqlite3.verbose();

export const getDatabase = () => {
  return new sqlite3.Database(dbPath);
};

export const initialiseSchema = () => {
  const db = getDatabase();
  const sql = `
    CREATE TABLE IF NOT EXISTS encuestas_pymes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL,
      sector TEXT NOT NULL,
      respuestas TEXT NOT NULL,
      submitted_at TEXT NOT NULL
    );
  `;

  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      db.close();
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};
