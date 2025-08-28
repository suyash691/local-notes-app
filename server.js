const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const MigrationManager = require('./migrations');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Initialize SQLite database - use data directory if it exists (for Docker)
const dbPath = require('fs').existsSync('./data') ? './data/notes.db' : './notes.db';
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database schema
async function initializeDatabase() {
    // Create notes table
    db.run(`
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            tags TEXT,
            date TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Create todos table
    db.run(`
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
    
    // Run database migrations
    try {
        const migrationManager = new MigrationManager(db);
        await migrationManager.runMigrations();
        
        // One-time fix: Inherit tags for existing TODOs that don't have tags yet
        setTimeout(() => {
            fixExistingTodoTags();
        }, 1000);
    } catch (error) {
        console.error('Migration failed:', error);
    }
    
    // Insert welcome note if database is empty
    db.get('SELECT COUNT(*) as count FROM notes', (err, row) => {
        if (!err && row.count === 0) {
            const welcomeNote = {
                title: "Welcome to Notes App",
                content: "This is your personal notes application with **Markdown support**!\n\n## Features\n- Create, edit, and delete notes\n- Full Markdown formatting\n- TODO tracking\n- Date filtering and grouping\n- SQLite database storage\n\n## TODO\n- Try creating a new note\n- Add some TODOs to track\n- Explore the TODO tab",
                tags: JSON.stringify(["tutorial", "welcome"]),
                date: new Date().toISOString()
            };
            
            db.run(
                'INSERT INTO notes (title, content, tags, date) VALUES (?, ?, ?, ?)',
                [welcomeNote.title, welcomeNote.content, welcomeNote.tags, welcomeNote.date],
                function(err) {
                    if (!err) {
                        extractAndSaveTodos(this.lastID, welcomeNote.content, welcomeNote.title);
                    }
                }
            );
        }
    });
}

// Extract TODOs from note content
function extractTodos(noteId, content, noteTitle) {
    const lines = content.split('\n');
    const extractedTodos = [];
    let inTodoSection = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check if this is a markdown heading containing TODO
        if (line.match(/^#+\s*TODO\s*$/i)) {
            inTodoSection = true;
            continue;
        }
        
        if (inTodoSection) {
            // Check for list items (- or *)
            if (line.startsWith('-') || line.startsWith('*')) {
                let todoText = line.substring(1).trim();
                let priority = 'medium'; // default priority
                
                if (todoText) {
                    // Check for priority indicators at the beginning: [H], [M], [L] or (!), (!!), (!!)
                    const priorityPatterns = [
                        { pattern: /^\[H\]\s*/i, priority: 'high' },
                        { pattern: /^\[HIGH\]\s*/i, priority: 'high' },
                        { pattern: /^!!!\s*/, priority: 'high' },
                        { pattern: /^\[M\]\s*/i, priority: 'medium' },
                        { pattern: /^\[MED\]\s*/i, priority: 'medium' },
                        { pattern: /^\[MEDIUM\]\s*/i, priority: 'medium' },
                        { pattern: /^!!\s*/, priority: 'medium' },
                        { pattern: /^\[L\]\s*/i, priority: 'low' },
                        { pattern: /^\[LOW\]\s*/i, priority: 'low' },
                        { pattern: /^!\s*/, priority: 'low' }
                    ];
                    
                    for (const { pattern, priority: p } of priorityPatterns) {
                        if (pattern.test(todoText)) {
                            priority = p;
                            todoText = todoText.replace(pattern, '');
                            break;
                        }
                    }
                    
                    extractedTodos.push({
                        id: `${noteId}-${i}`,
                        noteId: noteId,
                        noteTitle: noteTitle,
                        text: todoText,
                        completed: false,
                        createdDate: new Date().toISOString(),
                        completedDate: null,
                        completionComment: null,
                        priority: priority
                    });
                }
            } 
            // Exit TODO section when we hit another markdown heading
            else if (line.match(/^#+\s/)) {
                inTodoSection = false;
            }
            // Exit TODO section when we hit non-empty line that's not indented and not a list item
            else if (line && !line.startsWith(' ') && !line.startsWith('\t') && !line.startsWith('-') && !line.startsWith('*')) {
                inTodoSection = false;
            }
        }
    }
    
    return extractedTodos;
}

// Function to update a specific TODO in note content
function updateTodoInNoteContent(content, todoId, newText, newPriority) {
    const lines = content.split('\n');
    let inTodoSection = false;
    let updatedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const trimmedLine = line.trim();
        
        // Check if this is a markdown heading containing TODO
        if (trimmedLine.match(/^#+\s*TODO\s*$/i)) {
            inTodoSection = true;
            updatedLines.push(line);
            continue;
        }
        
        if (inTodoSection) {
            // Check for list items (- or *)
            if (trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) {
                const currentTodoId = `${todoId.split('-')[0]}-${i}`;
                
                if (currentTodoId === todoId) {
                    // This is the TODO to update
                    const indent = line.match(/^(\s*)/)[1]; // preserve indentation
                    const listMarker = trimmedLine.startsWith('-') ? '-' : '*';
                    
                    // Add priority prefix based on new priority
                    let priorityPrefix = '';
                    switch (newPriority) {
                        case 'high':
                            priorityPrefix = '[H] ';
                            break;
                        case 'low':
                            priorityPrefix = '[L] ';
                            break;
                        case 'medium':
                        default:
                            priorityPrefix = ''; // No prefix for medium priority
                            break;
                    }
                    
                    updatedLines.push(`${indent}${listMarker} ${priorityPrefix}${newText}`);
                } else {
                    updatedLines.push(line);
                }
            } else if (trimmedLine.match(/^#+\s/)) {
                // Exit TODO section when we hit another markdown heading
                inTodoSection = false;
                updatedLines.push(line);
            } else if (trimmedLine && !trimmedLine.startsWith(' ') && !trimmedLine.startsWith('\t') && !trimmedLine.startsWith('-') && !trimmedLine.startsWith('*')) {
                // Exit TODO section when we hit non-empty line that's not indented and not a list item
                inTodoSection = false;
                updatedLines.push(line);
            } else {
                updatedLines.push(line);
            }
        } else {
            updatedLines.push(line);
        }
    }
    
    return updatedLines.join('\n');
}

// Tag helper functions
async function getOrCreateTag(tagName) {
    return new Promise((resolve, reject) => {
        // Try to get existing tag
        db.get('SELECT id FROM tags WHERE name = ?', [tagName], (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (row) {
                resolve(row.id);
            } else {
                // Create new tag
                db.run(
                    'INSERT INTO tags (name, created_date) VALUES (?, ?)',
                    [tagName, new Date().toISOString()],
                    function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(this.lastID);
                        }
                    }
                );
            }
        });
    });
}

async function updateNoteTags(noteId, tagNames) {
    return new Promise(async (resolve, reject) => {
        try {
            // Delete existing note_tags
            db.run('DELETE FROM note_tags WHERE note_id = ?', [noteId], async (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!tagNames || tagNames.length === 0) {
                    resolve();
                    return;
                }
                
                // Add new tags
                for (const tagName of tagNames) {
                    const tagId = await getOrCreateTag(tagName);
                    await new Promise((resolveTag, rejectTag) => {
                        db.run(
                            'INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)',
                            [noteId, tagId],
                            (err) => {
                                if (err) rejectTag(err);
                                else resolveTag();
                            }
                        );
                    });
                }
                resolve();
            });
        } catch (error) {
            reject(error);
        }
    });
}

async function updateTodoTags(todoId, tagNames) {
    return new Promise(async (resolve, reject) => {
        try {
            // Delete existing todo_tags
            db.run('DELETE FROM todo_tags WHERE todo_id = ?', [todoId], async (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!tagNames || tagNames.length === 0) {
                    resolve();
                    return;
                }
                
                // Add new tags
                for (const tagName of tagNames) {
                    const tagId = await getOrCreateTag(tagName);
                    await new Promise((resolveTag, rejectTag) => {
                        db.run(
                            'INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)',
                            [todoId, tagId],
                            (err) => {
                                if (err) rejectTag(err);
                                else resolveTag();
                            }
                        );
                    });
                }
                resolve();
            });
        } catch (error) {
            reject(error);
        }
    });
}

async function inheritTagsFromParentNote(todoId, noteId) {
    return new Promise((resolve, reject) => {
        if (!noteId) {
            resolve(); // Standalone todo, no inheritance
            return;
        }
        
        // Get parent note tags
        db.all(`
            SELECT t.name 
            FROM tags t 
            JOIN note_tags nt ON t.id = nt.tag_id 
            WHERE nt.note_id = ?
        `, [noteId], async (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            
            const tagNames = rows.map(row => row.name);
            try {
                await updateTodoTags(todoId, tagNames);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    });
}

// Save todos to database - preserving completed status
function extractAndSaveTodos(noteId, content, noteTitle) {
    // First, get existing todos for this note to preserve completion status
    db.all('SELECT * FROM todos WHERE note_id = ?', [noteId], (err, existingTodos) => {
        if (err) {
            console.error('Error getting existing todos:', err);
            return;
        }
        
        // Create a map of existing todos by text for quick lookup
        const existingTodosMap = new Map();
        existingTodos.forEach(todo => {
            existingTodosMap.set(todo.text, todo);
        });
        
        // Extract new todos from content
        const newTodos = extractTodos(noteId, content, noteTitle);
        
        // Delete existing todos for this note
        db.run('DELETE FROM todos WHERE note_id = ?', [noteId], (err) => {
            if (err) {
                console.error('Error deleting old todos:', err);
                return;
            }
            
            // Insert new todos, preserving completion status for existing ones
            newTodos.forEach(todo => {
                const existingTodo = existingTodosMap.get(todo.text);
                if (existingTodo) {
                    // Preserve completion status and related data
                    todo.completed = existingTodo.completed;
                    todo.completedDate = existingTodo.completed_date;
                    todo.completionComment = existingTodo.completion_comment;
                    // Use priority from note content (already extracted) rather than from existing todo
                    // This allows priority changes made directly in note content to be reflected
                }
                
                db.run(
                    'INSERT INTO todos (id, note_id, note_title, text, completed, created_date, completed_date, completion_comment, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [todo.id, todo.noteId, todo.noteTitle, todo.text, todo.completed, todo.createdDate, todo.completedDate, todo.completionComment, todo.priority || 'medium'],
                    function(err) {
                        if (!err) {
                            // Inherit tags from parent note
                            inheritTagsFromParentNote(todo.id, noteId).catch(console.error);
                        }
                    }
                );
            });
        });
    });
}

// One-time function to inherit tags for existing TODOs
async function fixExistingTodoTags() {
    try {
        console.log('Checking for TODOs that need tag inheritance...');
        
        // Get all TODOs that are linked to notes but don't have tags
        db.all(`
            SELECT t.* FROM todos t 
            WHERE t.note_id IS NOT NULL 
            AND t.id NOT IN (SELECT todo_id FROM todo_tags)
        `, async (err, todos) => {
            if (err) {
                console.error('Error checking existing todos:', err);
                return;
            }
            
            if (todos.length === 0) {
                console.log('No existing TODOs need tag inheritance.');
                return;
            }
            
            console.log(`Found ${todos.length} TODOs that need tag inheritance.`);
            
            let processed = 0;
            for (const todo of todos) {
                try {
                    await inheritTagsFromParentNote(todo.id, todo.note_id);
                    processed++;
                } catch (error) {
                    console.error(`Failed to inherit tags for TODO ${todo.id}:`, error);
                }
            }
            
            console.log(`Successfully inherited tags for ${processed} TODOs.`);
        });
    } catch (error) {
        console.error('Error in fixExistingTodoTags:', error);
    }
}

// API Routes

// Get all notes with search support
app.get('/api/notes', (req, res) => {
    const { search } = req.query;
    let query = `
        SELECT n.*, 
               GROUP_CONCAT(t.name) as tag_names
        FROM notes n
        LEFT JOIN note_tags nt ON n.id = nt.note_id
        LEFT JOIN tags t ON nt.tag_id = t.id
    `;
    let params = [];
    
    if (search) {
        if (search.startsWith('tag:')) {
            // Tag-specific search
            const tagSearch = search.substring(4).trim();
            query += ' WHERE t.name LIKE ?';
            params = [`%${tagSearch}%`];
        } else {
            // General search
            query += ' WHERE n.title LIKE ? OR n.content LIKE ?';
            const searchParam = `%${search}%`;
            params = [searchParam, searchParam];
        }
    }
    
    query += ' GROUP BY n.id ORDER BY n.date DESC';
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Parse tags from comma-separated string
        const notes = rows.map(note => ({
            ...note,
            tags: note.tag_names ? note.tag_names.split(',').filter(tag => tag.trim()) : []
        }));
        
        res.json(notes);
    });
});

// Get single note
app.get('/api/notes/:id', (req, res) => {
    const { id } = req.params;
    
    const query = `
        SELECT n.*, 
               GROUP_CONCAT(t.name) as tag_names
        FROM notes n
        LEFT JOIN note_tags nt ON n.id = nt.note_id
        LEFT JOIN tags t ON nt.tag_id = t.id
        WHERE n.id = ?
        GROUP BY n.id
    `;
    
    db.get(query, [id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (!row) {
            res.status(404).json({ error: 'Note not found' });
            return;
        }
        
        const note = {
            ...row,
            tags: row.tag_names ? row.tag_names.split(',').filter(tag => tag.trim()) : []
        };
        
        res.json(note);
    });
});

// Create new note
app.post('/api/notes', async (req, res) => {
    const { title, content, tags } = req.body;
    const date = new Date().toISOString();
    
    db.run(
        'INSERT INTO notes (title, content, date) VALUES (?, ?, ?)',
        [title, content, date],
        async function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            const noteId = this.lastID;
            
            try {
                // Update tags using new normalized system
                await updateNoteTags(noteId, tags || []);
                
                // Extract and save todos
                extractAndSaveTodos(noteId, content, title);
                
                res.json({
                    id: noteId,
                    title,
                    content,
                    tags: tags || [],
                    date
                });
            } catch (error) {
                console.error('Error updating tags:', error);
                res.status(500).json({ error: 'Failed to update tags' });
            }
        }
    );
});

// Update note
app.put('/api/notes/:id', async (req, res) => {
    const { id } = req.params;
    const { title, content, tags } = req.body;
    
    db.run(
        'UPDATE notes SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [title, content, id],
        async function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            if (this.changes === 0) {
                res.status(404).json({ error: 'Note not found' });
                return;
            }
            
            try {
                // Update tags using new normalized system
                await updateNoteTags(id, tags || []);
                
                // Extract and save todos
                extractAndSaveTodos(id, content, title);
                
                // Get updated note with tags
                const query = `
                    SELECT n.*, 
                           GROUP_CONCAT(t.name) as tag_names
                    FROM notes n
                    LEFT JOIN note_tags nt ON n.id = nt.note_id
                    LEFT JOIN tags t ON nt.tag_id = t.id
                    WHERE n.id = ?
                    GROUP BY n.id
                `;
                
                db.get(query, [id], (err, row) => {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }
                    
                    const note = {
                        ...row,
                        tags: row.tag_names ? row.tag_names.split(',').filter(tag => tag.trim()) : []
                    };
                    
                    res.json(note);
                });
            } catch (error) {
                console.error('Error updating tags:', error);
                res.status(500).json({ error: 'Failed to update tags' });
            }
        }
    );
});

// Delete note
app.delete('/api/notes/:id', (req, res) => {
    const { id } = req.params;
    
    // First delete associated todos, then delete the note
    db.run('DELETE FROM todos WHERE note_id = ?', [id], (err) => {
        if (err) {
            console.error('Error deleting associated todos:', err);
            // Continue with note deletion even if todo deletion fails
        }
        
        db.run('DELETE FROM notes WHERE id = ?', [id], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            if (this.changes === 0) {
                res.status(404).json({ error: 'Note not found' });
                return;
            }
            
            res.json({ message: 'Note deleted successfully' });
        });
    });
});

// Get all todos with search support and optional filtering
app.get('/api/todos', (req, res) => {
    const { search, standalone, tag } = req.query;
    let query = `
        SELECT t.*, 
               GROUP_CONCAT(tags.name) as tag_names
        FROM todos t
        LEFT JOIN todo_tags tt ON t.id = tt.todo_id
        LEFT JOIN tags ON tt.tag_id = tags.id
    `;
    let params = [];
    let conditions = [];
    
    // Filter for standalone todos only
    if (standalone === 'true') {
        conditions.push('t.note_id IS NULL');
    } else if (standalone === 'false') {
        conditions.push('t.note_id IS NOT NULL');
    }
    
    // Handle search parameter (including tag: prefix)
    if (search) {
        if (search.startsWith('tag:')) {
            // Tag-specific search - use subquery to find todos with specific tags
            const tagSearch = search.substring(4).trim();
            conditions.push(`t.id IN (
                SELECT tt.todo_id 
                FROM todo_tags tt 
                JOIN tags tag_search ON tt.tag_id = tag_search.id 
                WHERE tag_search.name LIKE ?
            )`);
            params.push(`%${tagSearch}%`);
        } else {
            // General search
            conditions.push('(t.text LIKE ? OR t.note_title LIKE ?)');
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam);
        }
    }
    
    // Filter by tag (legacy parameter - can be removed later)
    if (tag) {
        conditions.push('tags.name LIKE ?');
        params.push(`%${tag}%`);
    }
    
    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' GROUP BY t.id ORDER BY t.completed ASC, t.priority DESC, t.created_date DESC';
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Convert SQLite boolean to JS boolean and parse tags
        const todos = rows.map(todo => ({
            ...todo,
            completed: Boolean(todo.completed),
            tags: todo.tag_names ? todo.tag_names.split(',').filter(tag => tag.trim()) : []
        }));
        
        res.json(todos);
    });
});

// Create new todo (standalone or note-linked)
app.post('/api/todos', async (req, res) => {
    const { text, priority = 'medium', note_id = null, note_title = null, tags = [] } = req.body;
    const id = note_id ? `${note_id}-${Date.now()}` : `standalone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const createdDate = new Date().toISOString();
    
    db.run(
        'INSERT INTO todos (id, note_id, note_title, text, priority, completed, created_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, note_id, note_title, text, priority, false, createdDate],
        async function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            try {
                if (note_id) {
                    // Inherit tags from parent note
                    await inheritTagsFromParentNote(id, note_id);
                } else {
                    // Use provided tags for standalone todo
                    await updateTodoTags(id, tags);
                }
                
                res.json({
                    id,
                    note_id,
                    note_title,
                    text,
                    priority,
                    completed: false,
                    created_date: createdDate,
                    completed_date: null,
                    completion_comment: null,
                    tags: note_id ? [] : tags // Tags will be inherited for note-based todos
                });
            } catch (error) {
                console.error('Error updating todo tags:', error);
                // Return the todo even if tag update fails
                res.json({
                    id,
                    note_id,
                    note_title,
                    text,
                    priority,
                    completed: false,
                    created_date: createdDate,
                    completed_date: null,
                    completion_comment: null,
                    tags: []
                });
            }
        }
    );
});

// Get all available tags
app.get('/api/tags', (req, res) => {
    db.all('SELECT * FROM tags ORDER BY name ASC', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Update todo completion status and priority
app.put('/api/todos/:id', (req, res) => {
    const { id } = req.params;
    const { completed, completionComment, priority } = req.body;
    const completedDate = completed ? new Date().toISOString() : null;
    
    // First get the current todo to check if it's linked to a note
    db.get('SELECT * FROM todos WHERE id = ?', [id], (err, currentTodo) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (!currentTodo) {
            res.status(404).json({ error: 'Todo not found' });
            return;
        }
        
        let query = 'UPDATE todos SET completed = ?, completed_date = ?, completion_comment = ?';
        let params = [completed, completedDate, completionComment || null];
        
        if (priority !== undefined) {
            query += ', priority = ?';
            params.push(priority);
        }
        
        query += ' WHERE id = ?';
        params.push(id);
        
        db.run(query, params, function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            if (this.changes === 0) {
                res.status(404).json({ error: 'Todo not found' });
                return;
            }
            
            // If this todo is linked to a note and priority was updated, update the note content
            if (currentTodo.note_id && priority !== undefined && priority !== currentTodo.priority) {
                db.get('SELECT * FROM notes WHERE id = ?', [currentTodo.note_id], (err, note) => {
                    if (err) {
                        console.error('Error getting note for priority update:', err);
                        // Continue with response even if note update fails
                        sendResponse();
                        return;
                    }
                    
                    if (note) {
                        // Update the note content with new priority
                        const updatedContent = updateTodoInNoteContent(note.content, id, currentTodo.text, priority);
                        
                        db.run(
                            'UPDATE notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                            [updatedContent, note.id],
                            function(err) {
                                if (err) {
                                    console.error('Error updating note content:', err);
                                }
                                sendResponse();
                            }
                        );
                    } else {
                        sendResponse();
                    }
                });
            } else {
                sendResponse();
            }
            
            function sendResponse() {
                // Get updated todo
                db.get('SELECT * FROM todos WHERE id = ?', [id], (err, row) => {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }
                    
                    const todo = {
                        ...row,
                        completed: Boolean(row.completed)
                    };
                    
                    res.json(todo);
                });
            }
        });
    });
});

// Delete todo (standalone or note-linked)
app.delete('/api/todos/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM todos WHERE id = ?', [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (this.changes === 0) {
            res.status(404).json({ error: 'Todo not found' });
            return;
        }
        
        res.json({ message: 'Todo deleted successfully' });
    });
});

// Edit todo text and priority (for note-based TODOs - also updates source note)
app.put('/api/todos/:id/edit', (req, res) => {
    const { id } = req.params;
    const { text, priority } = req.body;
    
    // First get the todo to find its note
    db.get('SELECT * FROM todos WHERE id = ?', [id], (err, todo) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (!todo) {
            res.status(404).json({ error: 'Todo not found' });
            return;
        }
        
        if (!todo.note_id) {
            res.status(400).json({ error: 'This endpoint is only for note-based TODOs' });
            return;
        }
        
        // Get the source note
        db.get('SELECT * FROM notes WHERE id = ?', [todo.note_id], (err, note) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            if (!note) {
                res.status(404).json({ error: 'Source note not found' });
                return;
            }
            
            // Update the note content
            const updatedContent = updateTodoInNoteContent(note.content, id, text, priority);
            
            // Update the note in database
            db.run(
                'UPDATE notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [updatedContent, note.id],
                function(err) {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }
                    
                    // Re-extract and save todos from the updated note
                    extractAndSaveTodos(note.id, updatedContent, note.title);
                    
                    // Return success (the todo will be updated via extractAndSaveTodos)
                    res.json({ 
                        success: true, 
                        message: 'Todo and source note updated successfully'
                    });
                }
            );
        });
    });
});

// Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed');
        }
        process.exit(0);
    });
});