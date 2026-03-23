const db = require('../db');
const { extractTodos } = require('../services/todoParser');
const { inheritTagsFromParentNote } = require('../services/tagService');

// Re-extracts TODOs from note content, preserving completion status for matching text
async function extractAndSaveTodos(noteId, content, noteTitle) {
    const existing = await db.allAsync('SELECT * FROM todos WHERE note_id = ?', [noteId]);
    const existingMap = new Map(existing.map(t => [t.text, t]));
    const newTodos = extractTodos(noteId, content, noteTitle);

    await db.runAsync('DELETE FROM todo_tags WHERE todo_id IN (SELECT id FROM todos WHERE note_id = ?)', [noteId]);
    await db.runAsync('DELETE FROM todos WHERE note_id = ?', [noteId]);

    for (const todo of newTodos) {
        const prev = existingMap.get(todo.text);
        if (prev) {
            todo.completed = prev.completed;
            todo.completedDate = prev.completed_date;
            todo.completionComment = prev.completion_comment;
        }

        await db.runAsync(
            'INSERT INTO todos (id, note_id, note_title, text, completed, created_date, completed_date, completion_comment, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [todo.id, todo.noteId, todo.noteTitle, todo.text, todo.completed ? 1 : 0, todo.createdDate, todo.completedDate, todo.completionComment, todo.priority]
        );

        try { await inheritTagsFromParentNote(todo.id, noteId); }
        catch (e) { console.error(`Tag inheritance failed for ${todo.id}:`, e); }
    }
}

module.exports = { extractAndSaveTodos };
