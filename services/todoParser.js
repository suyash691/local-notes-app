// Keep in sync with PRIORITY_PATTERNS in public/app.js
const PRIORITY_PATTERNS = [
    { pattern: /^\[H\]\s*/i, priority: 'high', label: 'H' },
    { pattern: /^\[HIGH\]\s*/i, priority: 'high', label: 'HIGH' },
    { pattern: /^!!!\s*/, priority: 'high', label: '!!!' },
    { pattern: /^\[M\]\s*/i, priority: 'medium', label: 'M' },
    { pattern: /^\[MED\]\s*/i, priority: 'medium', label: 'MED' },
    { pattern: /^\[MEDIUM\]\s*/i, priority: 'medium', label: 'MEDIUM' },
    { pattern: /^!!\s*/, priority: 'medium', label: '!!' },
    { pattern: /^\[L\]\s*/i, priority: 'low', label: 'L' },
    { pattern: /^\[LOW\]\s*/i, priority: 'low', label: 'LOW' },
    { pattern: /^!\s*/, priority: 'low', label: '!' }
];

const TODO_HEADING_RE = /^#+\s*TODO\s*$/i;
const HEADING_RE = /^#+\s/;

function isListItem(line) { return line.startsWith('-') || line.startsWith('*'); }

function exitsTodoSection(line) {
    return HEADING_RE.test(line) ||
        (line && !line.startsWith(' ') && !line.startsWith('\t') && !isListItem(line));
}

function parsePriority(text) {
    for (const { pattern, priority } of PRIORITY_PATTERNS) {
        if (pattern.test(text)) return { priority, cleanText: text.replace(pattern, '') };
    }
    return { priority: 'medium', cleanText: text };
}

function priorityToPrefix(priority) {
    if (priority === 'high') return '[H] ';
    if (priority === 'low') return '[L] ';
    return '';
}

// Walks markdown content line-by-line, firing callbacks for TODO sections and items
function walkTodoSections(content, { onTodoItem, onLine, onEnter }) {
    const lines = content.split('\n');
    let inTodo = false;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        if (TODO_HEADING_RE.test(trimmed)) {
            inTodo = true;
            if (onEnter) onEnter(i, lines[i]);
            else if (onLine) onLine(i, lines[i], true);
            continue;
        }

        if (inTodo) {
            if (isListItem(trimmed)) {
                const itemText = trimmed.substring(1).trim();
                if (itemText && onTodoItem) onTodoItem(i, lines[i], itemText, trimmed);
                else if (onLine) onLine(i, lines[i], true);
            } else if (exitsTodoSection(trimmed)) {
                inTodo = false;
                if (onLine) onLine(i, lines[i], false);
            } else {
                if (onLine) onLine(i, lines[i], true);
            }
        } else {
            if (onLine) onLine(i, lines[i], false);
        }
    }
}

function extractTodos(noteId, content, noteTitle) {
    const extracted = [];
    walkTodoSections(content, {
        onTodoItem(lineIndex, _raw, itemText) {
            const { priority, cleanText } = parsePriority(itemText);
            if (!cleanText) return;
            extracted.push({
                id: `${noteId}-${lineIndex}`, noteId, noteTitle,
                text: cleanText, completed: false,
                createdDate: new Date().toISOString(),
                completedDate: null, completionComment: null, priority
            });
        }
    });
    return extracted;
}

function updateTodoInNoteContent(content, todoId, newText, newPriority) {
    const result = [];
    const noteIdPart = todoId.split('-')[0];

    walkTodoSections(content, {
        onTodoItem(lineIndex, rawLine, _itemText, trimmedLine) {
            if (`${noteIdPart}-${lineIndex}` === todoId) {
                const indent = rawLine.match(/^(\s*)/)[1];
                const marker = trimmedLine[0];
                result.push(`${indent}${marker} ${priorityToPrefix(newPriority)}${newText}`);
            } else {
                result.push(rawLine);
            }
        },
        onLine(_i, rawLine) { result.push(rawLine); },
        onEnter(_i, rawLine) { result.push(rawLine); }
    });

    return result.join('\n');
}

module.exports = { PRIORITY_PATTERNS, extractTodos, updateTodoInNoteContent, parsePriority, priorityToPrefix };
