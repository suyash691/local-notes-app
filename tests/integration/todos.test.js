const request = require('supertest');
const { createTestApp, seedSchema } = require('./setup');

let app, db;

beforeEach(async () => {
    ({ app, db } = createTestApp());
    await seedSchema(db);
});

afterEach(() => db.close());

describe('POST /api/todos', () => {
    test('creates a standalone todo', async () => {
        const res = await request(app).post('/api/todos')
            .send({ text: 'Buy milk', priority: 'high', tags: ['shopping'] });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ text: 'Buy milk', priority: 'high', completed: false });
        expect(res.body.tags).toContain('shopping');
    });

    test('rejects missing text', async () => {
        const res = await request(app).post('/api/todos').send({ priority: 'high' });
        expect(res.status).toBe(400);
    });

    test('defaults to medium priority', async () => {
        const res = await request(app).post('/api/todos').send({ text: 'Task' });
        expect(res.body.priority).toBe('medium');
    });
});

describe('GET /api/todos', () => {
    beforeEach(async () => {
        await request(app).post('/api/todos').send({ text: 'A', priority: 'high', tags: ['urgent'] });
        await request(app).post('/api/todos').send({ text: 'B', priority: 'low' });
    });

    test('returns all todos', async () => {
        const res = await request(app).get('/api/todos');
        expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    test('filters standalone only', async () => {
        const res = await request(app).get('/api/todos?standalone=true');
        res.body.forEach(t => expect(t.note_id).toBeNull());
    });

    test('searches by text', async () => {
        const res = await request(app).get('/api/todos?search=A');
        expect(res.body.some(t => t.text === 'A')).toBe(true);
    });

    test('searches by tag', async () => {
        const res = await request(app).get('/api/todos?search=tag:urgent');
        expect(res.body.length).toBeGreaterThanOrEqual(1);
        expect(res.body.every(t => t.tags.includes('urgent'))).toBe(true);
    });
});

describe('PUT /api/todos/:id (complete/uncomplete)', () => {
    let todoId;

    beforeEach(async () => {
        const res = await request(app).post('/api/todos').send({ text: 'Task' });
        todoId = res.body.id;
    });

    test('completes a todo with comment', async () => {
        const res = await request(app).put(`/api/todos/${todoId}`)
            .send({ completed: true, completionComment: 'Done!' });
        expect(res.body.completed).toBe(true);
        expect(res.body.completion_comment).toBe('Done!');
        expect(res.body.completed_date).toBeTruthy();
    });

    test('uncompletes a todo', async () => {
        await request(app).put(`/api/todos/${todoId}`).send({ completed: true });
        const res = await request(app).put(`/api/todos/${todoId}`).send({ completed: false });
        expect(res.body.completed).toBe(false);
        expect(res.body.completed_date).toBeNull();
    });

    test('returns 404 for missing todo', async () => {
        const res = await request(app).put('/api/todos/nonexistent').send({ completed: true });
        expect(res.status).toBe(404);
    });
});

describe('PUT /api/todos/:id (edit text/priority)', () => {
    let todoId;

    beforeEach(async () => {
        const res = await request(app).post('/api/todos').send({ text: 'Original', priority: 'medium' });
        todoId = res.body.id;
    });

    test('updates text', async () => {
        const res = await request(app).put(`/api/todos/${todoId}`)
            .send({ text: 'Updated' });
        expect(res.body.text).toBe('Updated');
    });

    test('updates priority', async () => {
        const res = await request(app).put(`/api/todos/${todoId}`)
            .send({ priority: 'high' });
        expect(res.body.priority).toBe('high');
    });

    test('does not clobber completion status when editing text', async () => {
        await request(app).put(`/api/todos/${todoId}`).send({ completed: true, completionComment: 'Done' });
        const res = await request(app).put(`/api/todos/${todoId}`).send({ text: 'Edited' });
        expect(res.body.text).toBe('Edited');
        expect(res.body.completed).toBe(true);
        expect(res.body.completion_comment).toBe('Done');
    });
});

describe('PUT /api/todos/:id/edit (note-based)', () => {
    let noteId, todoId;

    beforeEach(async () => {
        const note = await request(app).post('/api/notes')
            .send({ title: 'N', content: '## TODO\n- [H] Original', tags: [] });
        noteId = note.body.id;
        const todos = await request(app).get('/api/todos');
        todoId = todos.body.find(t => t.note_id === noteId).id;
    });

    test('updates todo and source note', async () => {
        const res = await request(app).put(`/api/todos/${todoId}/edit`)
            .send({ text: 'Changed', priority: 'low' });
        expect(res.body.success).toBe(true);

        const note = await request(app).get(`/api/notes/${noteId}`);
        expect(note.body.content).toContain('[L] Changed');
        expect(note.body.content).not.toContain('Original');
    });

    test('rejects empty text', async () => {
        const res = await request(app).put(`/api/todos/${todoId}/edit`).send({ text: '' });
        expect(res.status).toBe(400);
    });
});

describe('DELETE /api/todos/:id', () => {
    test('deletes a standalone todo', async () => {
        const created = await request(app).post('/api/todos').send({ text: 'Delete me' });
        const res = await request(app).delete(`/api/todos/${created.body.id}`);
        expect(res.status).toBe(200);
    });

    test('returns 404 for missing todo', async () => {
        const res = await request(app).delete('/api/todos/nonexistent');
        expect(res.status).toBe(404);
    });
});

describe('GET /api/tags', () => {
    test('returns tags created via notes', async () => {
        await request(app).post('/api/notes').send({ title: 'T', content: 'C', tags: ['alpha', 'beta'] });
        const res = await request(app).get('/api/tags');
        expect(res.body.map(t => t.name)).toEqual(expect.arrayContaining(['alpha', 'beta']));
    });
});

describe('priority sync to source note', () => {
    test('changing todo priority updates note markdown', async () => {
        const note = await request(app).post('/api/notes')
            .send({ title: 'N', content: '## TODO\n- [L] Low task', tags: [] });
        const todos = await request(app).get('/api/todos');
        const todo = todos.body.find(t => t.note_id === note.body.id);

        await request(app).put(`/api/todos/${todo.id}`).send({ priority: 'high' });

        const updated = await request(app).get(`/api/notes/${note.body.id}`);
        expect(updated.body.content).toContain('[H] Low task');
    });
});
