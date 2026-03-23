// Starts a fresh server with an in-memory-like temp DB for Playwright tests
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpDb = path.join(os.tmpdir(), `notes-test-${Date.now()}.db`);
const origExists = fs.existsSync;
fs.existsSync = (p) => p === './data' ? false : origExists(p);

const sqlite3 = require('sqlite3').verbose();
const testDb = new sqlite3.Database(tmpDb);
testDb.run('PRAGMA journal_mode=WAL');
testDb.run('PRAGMA foreign_keys=ON');
testDb.runAsync = (sql, params = []) => new Promise((resolve, reject) => {
    testDb.run(sql, params, function (err) { if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes }); });
});
testDb.getAsync = (sql, params = []) => new Promise((resolve, reject) => {
    testDb.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});
testDb.allAsync = (sql, params = []) => new Promise((resolve, reject) => {
    testDb.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

require.cache[require.resolve('../../db')] = { id: require.resolve('../../db'), exports: testDb, loaded: true };
process.env.PORT = '3111';
require('../../server');

process.on('exit', () => { try { fs.unlinkSync(tmpDb); } catch {} });
