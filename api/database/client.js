import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_FILE || path.resolve(__dirname, 'encuesta.sqlite');

sqlite3.verbose();

export const getDatabase = () => {
  return new sqlite3.Database(dbPath);
};

export const initialiseSchema = () => {
  const db = getDatabase();
  const sql = `
    CREATE TABLE IF NOT EXISTS encuesta_respuestas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL,
      telefono TEXT NOT NULL,
      empresa TEXT NOT NULL,
      sector TEXT NOT NULL,
      empleados TEXT NOT NULL,
      facturacion TEXT NOT NULL,
      necesidades TEXT NOT NULL,
      comentarios TEXT,
      consentimiento_rgpd INTEGER NOT NULL,
      consentimiento_com INTEGER NOT NULL,
      consentimiento_whatsapp INTEGER NOT NULL,
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
