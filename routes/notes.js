const express = require('express');
const db = require('../db');
const { updateNoteTags } = require('../services/tagService');
const { extractAndSaveTodos } = require('./todoHelpers');

const router = express.Router();

const NOTE_WITH_TAGS = `
    SELECT n.id, n.title, n.content, n.date, n.created_at, n.updated_at,
           GROUP_CONCAT(DISTINCT t.name) as tag_names
    FROM notes n
    LEFT JOIN note_tags nt ON n.id = nt.note_id
    LEFT JOIN tags t ON nt.tag_id = t.id
`;

function parseNoteRow(row) {
    return { ...row, tags: row.tag_names ? [...new Set(row.tag_names.split(',').filter(t => t.trim()))] : [] };
}

function validateNoteBody(req, res, next) {
    const { title, content } = req.body;
    if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!content || typeof content !== 'string') return res.status(400).json({ error: 'Content is required' });
    next();
}

router.get('/', async (req, res) => {
    const { search } = req.query;
    let query = NOTE_WITH_TAGS;
    let params = [];

    if (search) {
        if (search.startsWith('tag:')) {
            query += ' WHERE t.name LIKE ?';
            params = [`%${search.substring(4).trim()}%`];
        } else {
            query += ' WHERE n.title LIKE ? OR n.content LIKE ?';
            params = [`%${search}%`, `%${search}%`];
        }
    }

    query += ' GROUP BY n.id ORDER BY n.date DESC';
    res.json((await db.allAsync(query, params)).map(parseNoteRow));
});

router.get('/:id', async (req, res) => {
    const row = await db.getAsync(NOTE_WITH_TAGS + ' WHERE n.id = ? GROUP BY n.id', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Note not found' });
    res.json(parseNoteRow(row));
});

router.post('/', validateNoteBody, async (req, res) => {
    const { title, content, tags } = req.body;
    const date = new Date().toISOString();
    const result = await db.runAsync('INSERT INTO notes (title, content, date) VALUES (?, ?, ?)', [title, content, date]);
    await updateNoteTags(result.lastID, tags || []);
    await extractAndSaveTodos(result.lastID, content, title);
    res.json({ id: result.lastID, title, content, tags: tags || [], date });
});

router.put('/:id', validateNoteBody, async (req, res) => {
    const { id } = req.params;
    const { title, content, tags } = req.body;
    const result = await db.runAsync('UPDATE notes SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [title, content, id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Note not found' });
    await updateNoteTags(id, tags || []);
    await extractAndSaveTodos(id, content, title);
    const row = await db.getAsync(NOTE_WITH_TAGS + ' WHERE n.id = ? GROUP BY n.id', [id]);
    res.json(parseNoteRow(row));
});

router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    await db.runAsync('DELETE FROM todo_tags WHERE todo_id IN (SELECT id FROM todos WHERE note_id = ?)', [id]);
    await db.runAsync('DELETE FROM todos WHERE note_id = ?', [id]);
    await db.runAsync('DELETE FROM note_tags WHERE note_id = ?', [id]);
    const result = await db.runAsync('DELETE FROM notes WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Note not found' });
    res.json({ message: 'Note deleted successfully' });
});

module.exports = router;
