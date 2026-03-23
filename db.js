const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const dbPath = fs.existsSync('./data') ? './data/notes.db' : './notes.db';
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) { console.error('DB open error:', err.message); return; }
    console.log('Connected to SQLite database');
    db.run('PRAGMA journal_mode=WAL');
    db.run('PRAGMA foreign_keys=ON');
});

db.runAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
    });
});

db.getAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});

db.allAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

module.exports = db;
