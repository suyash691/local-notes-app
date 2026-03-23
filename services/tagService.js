const db = require('../db');

async function getOrCreateTag(tagName) {
    const existing = await db.getAsync('SELECT id FROM tags WHERE name = ?', [tagName]);
    if (existing) return existing.id;
    const result = await db.runAsync(
        'INSERT INTO tags (name, created_date) VALUES (?, ?)',
        [tagName, new Date().toISOString()]
    );
    return result.lastID;
}

async function updateEntityTags(table, idColumn, entityId, tagNames) {
    await db.runAsync(`DELETE FROM ${table} WHERE ${idColumn} = ?`, [entityId]);
    if (!tagNames || tagNames.length === 0) return;
    for (const name of tagNames) {
        const tagId = await getOrCreateTag(name);
        await db.runAsync(`INSERT OR IGNORE INTO ${table} (${idColumn}, tag_id) VALUES (?, ?)`, [entityId, tagId]);
    }
}

const updateNoteTags = (noteId, tags) => updateEntityTags('note_tags', 'note_id', noteId, tags);
const updateTodoTags = (todoId, tags) => updateEntityTags('todo_tags', 'todo_id', todoId, tags);

async function inheritTagsFromParentNote(todoId, noteId) {
    if (!noteId) return;
    const rows = await db.allAsync(
        'SELECT t.name FROM tags t JOIN note_tags nt ON t.id = nt.tag_id WHERE nt.note_id = ?',
        [noteId]
    );
    await updateTodoTags(todoId, rows.map(r => r.name));
}

async function getAllTags() {
    return db.allAsync('SELECT * FROM tags ORDER BY name ASC');
}

module.exports = { getOrCreateTag, updateNoteTags, updateTodoTags, inheritTagsFromParentNote, getAllTags };
