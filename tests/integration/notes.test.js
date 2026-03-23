const request = require('supertest');
const { createTestApp, seedSchema } = require('./setup');

let app, db;

beforeEach(async () => {
    ({ app, db } = createTestApp());
    await seedSchema(db);
});

afterEach(() => db.close());

describe('POST /api/notes', () => {
    test('creates a note and returns it', async () => {
        const res = await request(app).post('/api/notes')
            .send({ title: 'Test', content: 'Body', tags: ['a'] });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ title: 'Test', content: 'Body', tags: ['a'] });
        expect(res.body.id).toBeDefined();
    });

    test('rejects missing title', async () => {
        const res = await request(app).post('/api/notes').send({ content: 'Body' });
        expect(res.status).toBe(400);
    });

    test('rejects missing content', async () => {
        const res = await request(app).post('/api/notes').send({ title: 'T' });
        expect(res.status).toBe(400);
    });

    test('rejects empty title', async () => {
        const res = await request(app).post('/api/notes').send({ title: '  ', content: 'C' });
        expect(res.status).toBe(400);
    });

    test('extracts todos from content', async () => {
        const note = await request(app).post('/api/notes')
            .send({ title: 'T', content: '## TODO\n- [H] Task A\n- Task B', tags: [] });
        const todos = await request(app).get('/api/todos');
        expect(todos.body.filter(t => t.note_id === note.body.id)).toHaveLength(2);
    });

    test('inherits tags to extracted todos', async () => {
        const note = await request(app).post('/api/notes')
            .send({ title: 'T', content: '## TODO\n- Task', tags: ['inherited'] });
        const todos = await request(app).get('/api/todos');
        expect(todos.body.find(t => t.note_id === note.body.id).tags).toContain('inherited');
    });
});

describe('GET /api/notes', () => {
    let countBefore;
    beforeEach(async () => {
        countBefore = (await request(app).get('/api/notes')).body.length;
        await request(app).post('/api/notes').send({ title: 'Alpha', content: 'First', tags: ['work'] });
        await request(app).post('/api/notes').send({ title: 'Beta', content: 'Second', tags: ['personal'] });
    });

    test('returns all notes', async () => {
        const res = await request(app).get('/api/notes');
        expect(res.body).toHaveLength(countBefore + 2);
    });

    test('searches by title', async () => {
        const res = await request(app).get('/api/notes?search=Alpha');
        expect(res.body.every(n => n.title === 'Alpha')).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    test('searches by content', async () => {
        const res = await request(app).get('/api/notes?search=Second');
        expect(res.body.length).toBeGreaterThanOrEqual(1);
        expect(res.body.some(n => n.content === 'Second')).toBe(true);
    });

    test('searches by tag', async () => {
        const res = await request(app).get('/api/notes?search=tag:work');
        expect(res.body.length).toBeGreaterThanOrEqual(1);
        expect(res.body.every(n => n.tags.includes('work'))).toBe(true);
    });
});

describe('GET /api/notes/:id', () => {
    test('returns a single note', async () => {
        const created = await request(app).post('/api/notes').send({ title: 'T', content: 'C', tags: [] });
        const res = await request(app).get(`/api/notes/${created.body.id}`);
        expect(res.status).toBe(200);
        expect(res.body.title).toBe('T');
    });

    test('returns 404 for missing note', async () => {
        const res = await request(app).get('/api/notes/999');
        expect(res.status).toBe(404);
    });
});

describe('PUT /api/notes/:id', () => {
    beforeEach(async () => {
        await request(app).post('/api/notes').send({ title: 'Old', content: 'Old body', tags: ['old'] });
    });

    test('updates title, content, and tags', async () => {
        const res = await request(app).put('/api/notes/1')
            .send({ title: 'New', content: 'New body', tags: ['new'] });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ title: 'New', content: 'New body', tags: ['new'] });
    });

    test('re-extracts todos on update', async () => {
        await request(app).put('/api/notes/1')
            .send({ title: 'T', content: '## TODO\n- A\n- B\n- C', tags: [] });
        const todos = await request(app).get('/api/todos');
        expect(todos.body.filter(t => t.note_id === 1)).toHaveLength(3);
    });

    test('returns 404 for missing note', async () => {
        const res = await request(app).put('/api/notes/999').send({ title: 'T', content: 'C' });
        expect(res.status).toBe(404);
    });
});

describe('DELETE /api/notes/:id', () => {
    test('deletes note and its todos', async () => {
        const note = await request(app).post('/api/notes')
            .send({ title: 'T', content: '## TODO\n- Task', tags: ['t'] });
        const noteId = note.body.id;
        const del = await request(app).delete(`/api/notes/${noteId}`);
        expect(del.status).toBe(200);

        const got = await request(app).get(`/api/notes/${noteId}`);
        expect(got.status).toBe(404);

        const todos = await request(app).get('/api/todos');
        expect(todos.body.filter(t => t.note_id === noteId)).toHaveLength(0);
    });

    test('returns 404 for missing note', async () => {
        const res = await request(app).delete('/api/notes/999');
        expect(res.status).toBe(404);
    });
});
