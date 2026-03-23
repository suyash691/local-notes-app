const express = require('express');
const db = require('../db');
const { updateTodoTags, inheritTagsFromParentNote } = require('../services/tagService');
const { updateTodoInNoteContent } = require('../services/todoParser');
const { extractAndSaveTodos } = require('./todoHelpers');

const router = express.Router();

function validateTodoBody(req, res, next) {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'Text is required' });
    next();
}

router.get('/', async (req, res) => {
    const { search, standalone, tag } = req.query;
    let query = `
        SELECT t.*, n.title as live_note_title,
               GROUP_CONCAT(DISTINCT tags.name) as tag_names
        FROM todos t
        LEFT JOIN notes n ON t.note_id = n.id
        LEFT JOIN todo_tags tt ON t.id = tt.todo_id
        LEFT JOIN tags ON tt.tag_id = tags.id`;
    let params = [];
    let conditions = [];

    if (standalone === 'true') conditions.push('t.note_id IS NULL');
    else if (standalone === 'false') conditions.push('t.note_id IS NOT NULL');

    if (search) {
        if (search.startsWith('tag:')) {
            conditions.push('t.id IN (SELECT tt2.todo_id FROM todo_tags tt2 JOIN tags t2 ON tt2.tag_id = t2.id WHERE t2.name LIKE ?)');
            params.push(`%${search.substring(4).trim()}%`);
        } else {
            conditions.push('(t.text LIKE ? OR COALESCE(n.title, t.note_title) LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }
    }

    if (tag) { conditions.push('tags.name LIKE ?'); params.push(`%${tag}%`); }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' GROUP BY t.id ORDER BY t.completed ASC, t.priority DESC, t.created_date DESC';

    const rows = await db.allAsync(query, params);
    const todos = rows.map(todo => ({
        ...todo,
        note_title: todo.live_note_title || todo.note_title,
        completed: Boolean(todo.completed),
        tags: todo.tag_names ? [...new Set(todo.tag_names.split(',').filter(t => t.trim()))] : []
    }));
    todos.forEach(t => delete t.live_note_title);
    res.json(todos);
});

router.post('/', validateTodoBody, async (req, res) => {
    const { text, priority = 'medium', note_id = null, note_title = null, tags = [] } = req.body;
    const id = note_id
        ? `${note_id}-${Date.now()}`
        : `standalone-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const createdDate = new Date().toISOString();

    await db.runAsync(
        'INSERT INTO todos (id, note_id, note_title, text, priority, completed, created_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, note_id, note_title, text, priority, 0, createdDate]
    );

    if (note_id) await inheritTagsFromParentNote(id, note_id);
    else await updateTodoTags(id, tags);

    res.json({ id, note_id, note_title, text, priority, completed: false, created_date: createdDate, completed_date: null, completion_comment: null, tags: note_id ? [] : tags });
});

router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { completed, completionComment, priority, text } = req.body;

    const current = await db.getAsync('SELECT * FROM todos WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ error: 'Todo not found' });

    const completedDate = completed ? new Date().toISOString() : null;
    let query = 'UPDATE todos SET completed = ?, completed_date = ?, completion_comment = ?';
    let params = [completed !== undefined ? (completed ? 1 : 0) : current.completed, completedDate !== undefined ? completedDate : current.completed_date, completionComment !== undefined ? (completionComment || null) : current.completion_comment];
    if (priority !== undefined) { query += ', priority = ?'; params.push(priority); }
    if (text !== undefined) { query += ', text = ?'; params.push(text); }
    query += ' WHERE id = ?';
    params.push(id);

    const result = await db.runAsync(query, params);
    if (result.changes === 0) return res.status(404).json({ error: 'Todo not found' });

    // Sync priority back to the source note's markdown
    if (current.note_id && priority !== undefined && priority !== current.priority) {
        const note = await db.getAsync('SELECT * FROM notes WHERE id = ?', [current.note_id]);
        if (note) {
            const updated = updateTodoInNoteContent(note.content, id, current.text, priority);
            await db.runAsync('UPDATE notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [updated, note.id]);
        }
    }

    const row = await db.getAsync('SELECT * FROM todos WHERE id = ?', [id]);
    res.json({ ...row, completed: Boolean(row.completed) });
});

router.put('/:id/edit', async (req, res) => {
    const { id } = req.params;
    const { text, priority } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'Text is required' });

    const todo = await db.getAsync('SELECT * FROM todos WHERE id = ?', [id]);
    if (!todo) return res.status(404).json({ error: 'Todo not found' });

    if (!todo.note_id) {
        await db.runAsync('UPDATE todos SET text = ?, priority = ? WHERE id = ?', [text, priority || todo.priority, id]);
        return res.json({ success: true, message: 'Standalone todo updated' });
    }

    const note = await db.getAsync('SELECT * FROM notes WHERE id = ?', [todo.note_id]);
    if (!note) return res.status(404).json({ error: 'Source note not found' });

    const updated = updateTodoInNoteContent(note.content, id, text, priority);
    await db.runAsync('UPDATE notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [updated, note.id]);
    await extractAndSaveTodos(note.id, updated, note.title);
    res.json({ success: true, message: 'Todo and source note updated' });
});

router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    await db.runAsync('DELETE FROM todo_tags WHERE todo_id = ?', [id]);
    const result = await db.runAsync('DELETE FROM todos WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Todo not found' });
    res.json({ message: 'Todo deleted successfully' });
});

module.exports = router;
