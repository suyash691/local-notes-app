const { freshDb, seedSchema } = require('../testUtils');

let db, tagService;

beforeEach(async () => {
    db = freshDb();
    await seedSchema(db);
    jest.resetModules();
    jest.doMock('../../db', () => db);
    tagService = require('../../services/tagService');
});

afterEach(() => { db.close(); jest.restoreAllMocks(); });

describe('getOrCreateTag', () => {
    test('creates a new tag and returns its id', async () => {
        const id = await tagService.getOrCreateTag('work');
        expect(typeof id).toBe('number');
        const row = await db.getAsync('SELECT * FROM tags WHERE id = ?', [id]);
        expect(row.name).toBe('work');
    });

    test('returns existing tag id on duplicate', async () => {
        const id1 = await tagService.getOrCreateTag('work');
        const id2 = await tagService.getOrCreateTag('work');
        expect(id1).toBe(id2);
    });
});

describe('updateNoteTags', () => {
    test('sets tags for a note', async () => {
        await db.runAsync("INSERT INTO notes (title, content, date) VALUES ('T', 'C', '2024-01-01')");
        await tagService.updateNoteTags(1, ['a', 'b']);
        const rows = await db.allAsync('SELECT t.name FROM tags t JOIN note_tags nt ON t.id = nt.tag_id WHERE nt.note_id = 1');
        expect(rows.map(r => r.name).sort()).toEqual(['a', 'b']);
    });

    test('replaces existing tags', async () => {
        await db.runAsync("INSERT INTO notes (title, content, date) VALUES ('T', 'C', '2024-01-01')");
        await tagService.updateNoteTags(1, ['old']);
        await tagService.updateNoteTags(1, ['new']);
        const rows = await db.allAsync('SELECT t.name FROM tags t JOIN note_tags nt ON t.id = nt.tag_id WHERE nt.note_id = 1');
        expect(rows.map(r => r.name)).toEqual(['new']);
    });

    test('clears tags when empty array', async () => {
        await db.runAsync("INSERT INTO notes (title, content, date) VALUES ('T', 'C', '2024-01-01')");
        await tagService.updateNoteTags(1, ['a']);
        await tagService.updateNoteTags(1, []);
        const rows = await db.allAsync('SELECT * FROM note_tags WHERE note_id = 1');
        expect(rows).toHaveLength(0);
    });
});

describe('updateTodoTags', () => {
    test('sets tags for a todo', async () => {
        await db.runAsync("INSERT INTO todos (id, text, created_date) VALUES ('t1', 'task', '2024-01-01')");
        await tagService.updateTodoTags('t1', ['x']);
        const rows = await db.allAsync('SELECT t.name FROM tags t JOIN todo_tags tt ON t.id = tt.tag_id WHERE tt.todo_id = ?', ['t1']);
        expect(rows[0].name).toBe('x');
    });
});

describe('inheritTagsFromParentNote', () => {
    test('copies note tags to a todo', async () => {
        await db.runAsync("INSERT INTO notes (title, content, date) VALUES ('T', 'C', '2024-01-01')");
        await db.runAsync("INSERT INTO todos (id, note_id, text, created_date) VALUES ('t1', 1, 'task', '2024-01-01')");
        await tagService.updateNoteTags(1, ['inherited']);
        await tagService.inheritTagsFromParentNote('t1', 1);
        const rows = await db.allAsync('SELECT t.name FROM tags t JOIN todo_tags tt ON t.id = tt.tag_id WHERE tt.todo_id = ?', ['t1']);
        expect(rows[0].name).toBe('inherited');
    });

    test('does nothing for null noteId', async () => {
        await tagService.inheritTagsFromParentNote('t1', null);
    });
});

describe('getAllTags', () => {
    test('returns tags sorted by name', async () => {
        await tagService.getOrCreateTag('zebra');
        await tagService.getOrCreateTag('alpha');
        const tags = await tagService.getAllTags();
        expect(tags.map(t => t.name)).toEqual(['alpha', 'zebra']);
    });
});
