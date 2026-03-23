const path = require('path');
const { freshDb, seedSchema } = require('../testUtils');

function createTestApp() {
    const db = freshDb();

    jest.resetModules();
    jest.doMock('../../db', () => db);

    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../../public')));
    app.use('/api/notes', require('../../routes/notes'));
    app.use('/api/todos', require('../../routes/todos'));
    app.use('/api/tags', require('../../routes/tags'));
    app.use((err, req, res, next) => { res.status(err.status || 500).json({ error: err.message }); });

    return { app, db };
}

module.exports = { createTestApp, seedSchema };
