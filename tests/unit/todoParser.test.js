const { extractTodos, updateTodoInNoteContent, parsePriority, priorityToPrefix } = require('../../services/todoParser');

describe('parsePriority', () => {
    test.each([
        ['[H] task', 'high', 'task'],
        ['[HIGH] task', 'high', 'task'],
        ['!!! task', 'high', 'task'],
        ['[M] task', 'medium', 'task'],
        ['[MED] task', 'medium', 'task'],
        ['!! task', 'medium', 'task'],
        ['[L] task', 'low', 'task'],
        ['[LOW] task', 'low', 'task'],
        ['! task', 'low', 'task'],
        ['plain task', 'medium', 'plain task'],
    ])('"%s" → %s priority, text "%s"', (input, expectedPri, expectedText) => {
        const { priority, cleanText } = parsePriority(input);
        expect(priority).toBe(expectedPri);
        expect(cleanText).toBe(expectedText);
    });

    test('is case insensitive for bracket syntax', () => {
        expect(parsePriority('[h] task').priority).toBe('high');
        expect(parsePriority('[High] task').priority).toBe('high');
    });
});

describe('priorityToPrefix', () => {
    test.each([
        ['high', '[H] '],
        ['low', '[L] '],
        ['medium', ''],
    ])('%s → "%s"', (pri, expected) => {
        expect(priorityToPrefix(pri)).toBe(expected);
    });
});

describe('extractTodos', () => {
    test('extracts todos from a TODO section', () => {
        const content = '# My Note\nSome text\n## TODO\n- [H] High task\n- Normal task\n- [L] Low task\n## Other\n- Not a todo';
        const todos = extractTodos(1, content, 'Test');

        expect(todos).toHaveLength(3);
        expect(todos[0]).toMatchObject({ text: 'High task', priority: 'high', noteId: 1, noteTitle: 'Test' });
        expect(todos[1]).toMatchObject({ text: 'Normal task', priority: 'medium' });
        expect(todos[2]).toMatchObject({ text: 'Low task', priority: 'low' });
    });

    test('stops at next heading', () => {
        const content = '## TODO\n- Task 1\n## Not TODO\n- Task 2';
        expect(extractTodos(1, content, 'T')).toHaveLength(1);
    });

    test('handles * list markers', () => {
        const content = '## TODO\n* Task A\n* Task B';
        expect(extractTodos(1, content, 'T')).toHaveLength(2);
    });

    test('returns empty for no TODO section', () => {
        expect(extractTodos(1, '# Just a note\nNo todos here', 'T')).toHaveLength(0);
    });

    test('skips empty list items', () => {
        const content = '## TODO\n- \n- Real task';
        expect(extractTodos(1, content, 'T')).toHaveLength(1);
    });

    test('generates line-based IDs', () => {
        const content = '## TODO\n- A\n- B';
        const todos = extractTodos(5, content, 'T');
        expect(todos[0].id).toBe('5-1');
        expect(todos[1].id).toBe('5-2');
    });

    test('handles multiple TODO sections', () => {
        const content = '## TODO\n- First\n## Other\ntext\n## TODO\n- Second';
        expect(extractTodos(1, content, 'T')).toHaveLength(2);
    });
});

describe('updateTodoInNoteContent', () => {
    const content = '## TODO\n- [H] Old task\n- Another task';

    test('updates text and priority of a specific todo', () => {
        const result = updateTodoInNoteContent(content, '1-1', 'New task', 'low');
        expect(result).toContain('[L] New task');
        expect(result).not.toContain('Old task');
    });

    test('preserves other todos', () => {
        const result = updateTodoInNoteContent(content, '1-1', 'New task', 'low');
        expect(result).toContain('Another task');
    });

    test('medium priority has no prefix', () => {
        const result = updateTodoInNoteContent(content, '1-1', 'New task', 'medium');
        expect(result).toContain('- New task');
        expect(result).not.toContain('[');
    });

    test('preserves indentation', () => {
        const indented = '## TODO\n  - [H] Indented task';
        const result = updateTodoInNoteContent(indented, '1-1', 'Updated', 'high');
        expect(result).toBe('## TODO\n  - [H] Updated');
    });

    test('preserves list marker style', () => {
        const star = '## TODO\n* [H] Star task';
        const result = updateTodoInNoteContent(star, '1-1', 'Updated', 'high');
        expect(result).toContain('* [H] Updated');
    });
});
