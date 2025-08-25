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
                    todo.priority = existingTodo.priority || 'medium';
                }
                
                db.run(
                    'INSERT INTO todos (id, note_id, note_title, text, completed, created_date, completed_date, completion_comment, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [todo.id, todo.noteId, todo.noteTitle, todo.text, todo.completed, todo.createdDate, todo.completedDate, todo.completionComment, todo.priority || 'medium']
                );
            });
        });
    });
}

// API Routes

// Get all notes with search support
app.get('/api/notes', (req, res) => {
    const { search } = req.query;
    let query = 'SELECT * FROM notes';
    let params = [];
    
    if (search) {
        if (search.startsWith('tag:')) {
            // Tag-specific search
            const tagSearch = search.substring(4).trim();
            query += ' WHERE tags LIKE ?';
            params = [`%"${tagSearch}"%`];
        } else {
            // General search
            query += ' WHERE title LIKE ? OR content LIKE ?';
            const searchParam = `%${search}%`;
            params = [searchParam, searchParam];
        }
    }
    
    query += ' ORDER BY date DESC';
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Parse tags back to array
        const notes = rows.map(note => ({
            ...note,
            tags: note.tags ? JSON.parse(note.tags) : []
        }));
        
        res.json(notes);
    });
});

// Get single note
app.get('/api/notes/:id', (req, res) => {
    const { id } = req.params;
    
    db.get('SELECT * FROM notes WHERE id = ?', [id], (err, row) => {
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
            tags: row.tags ? JSON.parse(row.tags) : []
        };
        
        res.json(note);
    });
});

// Create new note
app.post('/api/notes', (req, res) => {
    const { title, content, tags } = req.body;
    const date = new Date().toISOString();
    const tagsJson = JSON.stringify(tags || []);
    
    db.run(
        'INSERT INTO notes (title, content, tags, date) VALUES (?, ?, ?, ?)',
        [title, content, tagsJson, date],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            const noteId = this.lastID;
            
            // Extract and save todos
            extractAndSaveTodos(noteId, content, title);
            
            res.json({
                id: noteId,
                title,
                content,
                tags: tags || [],
                date
            });
        }
    );
});

// Update note
app.put('/api/notes/:id', (req, res) => {
    const { id } = req.params;
    const { title, content, tags } = req.body;
    const tagsJson = JSON.stringify(tags || []);
    
    db.run(
        'UPDATE notes SET title = ?, content = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [title, content, tagsJson, id],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            if (this.changes === 0) {
                res.status(404).json({ error: 'Note not found' });
                return;
            }
            
            // Extract and save todos
            extractAndSaveTodos(id, content, title);
            
            // Get updated note
            db.get('SELECT * FROM notes WHERE id = ?', [id], (err, row) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                
                const note = {
                    ...row,
                    tags: row.tags ? JSON.parse(row.tags) : []
                };
                
                res.json(note);
            });
        }
    );
});

// Delete note
app.delete('/api/notes/:id', (req, res) => {
    const { id } = req.params;
    
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

// Get all todos with search support
app.get('/api/todos', (req, res) => {
    const { search } = req.query;
    let query = 'SELECT * FROM todos';
    let params = [];
    
    if (search) {
        query += ' WHERE text LIKE ? OR note_title LIKE ?';
        const searchParam = `%${search}%`;
        params = [searchParam, searchParam];
    }
    
    query += ' ORDER BY completed ASC, priority DESC, created_date DESC';
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Convert SQLite boolean to JS boolean
        const todos = rows.map(todo => ({
            ...todo,
            completed: Boolean(todo.completed)
        }));
        
        res.json(todos);
    });
});

// Get all standalone todos
app.get('/api/standalone-todos', (req, res) => {
    const { search } = req.query;
    let query = 'SELECT * FROM standalone_todos';
    let params = [];
    
    if (search) {
        query += ' WHERE text LIKE ?';
        params = [`%${search}%`];
    }
    
    query += ' ORDER BY completed ASC, priority DESC, created_date DESC';
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Convert SQLite boolean to JS boolean
        const todos = rows.map(todo => ({
            ...todo,
            completed: Boolean(todo.completed)
        }));
        
        res.json(todos);
    });
});

// Create standalone todo
app.post('/api/standalone-todos', (req, res) => {
    const { text, priority = 'medium' } = req.body;
    const id = `standalone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const createdDate = new Date().toISOString();
    
    db.run(
        'INSERT INTO standalone_todos (id, text, priority, completed, created_date) VALUES (?, ?, ?, ?, ?)',
        [id, text, priority, false, createdDate],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            res.json({
                id,
                text,
                priority,
                completed: false,
                created_date: createdDate,
                completed_date: null,
                completion_comment: null
            });
        }
    );
});

// Update standalone todo
app.put('/api/standalone-todos/:id', (req, res) => {
    const { id } = req.params;
    const { completed, completionComment, priority, text } = req.body;
    const completedDate = completed !== undefined && completed ? new Date().toISOString() : null;
    
    // Build dynamic query based on provided fields
    let setParts = [];
    let params = [];
    
    if (completed !== undefined) {
        setParts.push('completed = ?');
        params.push(completed);
        setParts.push('completed_date = ?');
        params.push(completedDate);
        setParts.push('completion_comment = ?');
        params.push(completionComment || null);
    }
    
    if (priority !== undefined) {
        setParts.push('priority = ?');
        params.push(priority);
    }
    
    if (text !== undefined) {
        setParts.push('text = ?');
        params.push(text);
    }
    
    if (setParts.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
    }
    
    const query = `UPDATE standalone_todos SET ${setParts.join(', ')} WHERE id = ?`;
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
        
        // Get updated todo
        db.get('SELECT * FROM standalone_todos WHERE id = ?', [id], (err, row) => {
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
    });
});

// Delete standalone todo
app.delete('/api/standalone-todos/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM standalone_todos WHERE id = ?', [id], function(err) {
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

// Update todo completion status and priority
app.put('/api/todos/:id', (req, res) => {
    const { id } = req.params;
    const { completed, completionComment, priority } = req.body;
    const completedDate = completed ? new Date().toISOString() : null;
    
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