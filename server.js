const express = require('express');
const path = require('path');
const db = require('./db');
const MigrationManager = require('./migrations');
const { inheritTagsFromParentNote, updateNoteTags } = require('./services/tagService');
const { extractAndSaveTodos } = require('./routes/todoHelpers');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/notes', require('./routes/notes'));
app.use('/api/todos', require('./routes/todos'));
app.use('/api/tags', require('./routes/tags'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Express 5 catches async rejections and forwards them here
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
});

async function initializeDatabase() {
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            date TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS todos (
            id TEXT PRIMARY KEY,
            note_id INTEGER,
            note_title TEXT,
            text TEXT NOT NULL,
            completed BOOLEAN DEFAULT 0,
            created_date TEXT NOT NULL,
            completed_date TEXT,
            completion_comment TEXT,
            priority TEXT DEFAULT 'medium',
            FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
        )
    `);

    const migrationManager = new MigrationManager(db);
    await migrationManager.runMigrations();

    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id)');
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id)');
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_todo_tags_todo_id ON todo_tags(todo_id)');
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_todo_tags_tag_id ON todo_tags(tag_id)');
    await db.runAsync('CREATE INDEX IF NOT EXISTS idx_todos_note_id ON todos(note_id)');

    await fixExistingTodoTags();
    await seedWelcomeNote();
}

async function seedWelcomeNote() {
    const row = await db.getAsync('SELECT COUNT(*) as count FROM notes');
    if (row.count > 0) return;

    const content = "This is your personal notes application with **Markdown support**!\n\n## Features\n- Create, edit, and delete notes\n- Full Markdown formatting\n- TODO tracking\n- Date filtering and grouping\n- SQLite database storage\n\n## TODO\n- Try creating a new note\n- Add some TODOs to track\n- Explore the TODO tab";
    const result = await db.runAsync(
        'INSERT INTO notes (title, content, date) VALUES (?, ?, ?)',
        ["Welcome to Notes App", content, new Date().toISOString()]
    );
    await updateNoteTags(result.lastID, ['tutorial', 'welcome']);
    await extractAndSaveTodos(result.lastID, content, "Welcome to Notes App");
}

async function fixExistingTodoTags() {
    const rows = await db.allAsync(`
        SELECT t.* FROM todos t
        WHERE t.note_id IS NOT NULL
        AND t.id NOT IN (SELECT todo_id FROM todo_tags)
    `);
    if (rows.length === 0) return;

    console.log(`Inheriting tags for ${rows.length} TODOs...`);
    let ok = 0;
    for (const todo of rows) {
        try { await inheritTagsFromParentNote(todo.id, todo.note_id); ok++; }
        catch (e) { console.error(`Tag inheritance failed for ${todo.id}:`, e); }
    }
    console.log(`Inherited tags for ${ok} TODOs.`);
}

initializeDatabase()
    .then(() => app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`)))
    .catch(err => { console.error('DB init failed:', err); process.exit(1); });

process.on('SIGINT', () => {
    db.close(() => process.exit(0));
});
