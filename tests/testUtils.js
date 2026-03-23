const sqlite3 = require('sqlite3').verbose();

const SCHEMA = [
    `CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_date TEXT NOT NULL)`,
    `CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, date TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE todos (id TEXT PRIMARY KEY, note_id INTEGER, note_title TEXT, text TEXT NOT NULL, completed BOOLEAN DEFAULT 0, created_date TEXT NOT NULL, completed_date TEXT, completion_comment TEXT, priority TEXT DEFAULT 'medium', FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE)`,
    `CREATE TABLE note_tags (note_id TEXT NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (note_id, tag_id))`,
    `CREATE TABLE todo_tags (todo_id TEXT NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (todo_id, tag_id))`,
];

function promisifyDb(db) {
    db.runAsync = (sql, params = []) => new Promise((resolve, reject) => {
        db.run(sql, params, function (err) { if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes }); });
    });
    db.getAsync = (sql, params = []) => new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    });
    db.allAsync = (sql, params = []) => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
    });
    return db;
}

function freshDb() {
    const db = promisifyDb(new sqlite3.Database(':memory:'));
    db.run('PRAGMA foreign_keys=ON');
    return db;
}

async function seedSchema(db) {
    for (const sql of SCHEMA) await db.runAsync(sql);
}

module.exports = { freshDb, seedSchema, promisifyDb, SCHEMA };
