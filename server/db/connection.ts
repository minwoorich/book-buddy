import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { migrate } from './migrate'

let db: Database.Database | null = null

export function initDb(path = '.data/bookbuddy.sqlite'): Database.Database {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }
  if (db) {
    try {
      db.close()
    } catch {
      // ignore: connection may already be closed
    }
  }
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

export function getDb(): Database.Database {
  return db ?? initDb()
}
