const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Initialize SQLite database
const db = new sqlite3.Database('notes.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database schema
function initializeDatabase() {
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
            FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
        )
    `);
    
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
                const todoText = line.substring(1).trim();
                if (todoText) {
                    extractedTodos.push({
                        id: `${noteId}-${i}`,
                        noteId: noteId,
                        noteTitle: noteTitle,
                        text: todoText,
                        completed: false,
                        createdDate: new Date().toISOString(),
                        completedDate: null,
                        completionComment: null
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

// Save todos to database
function extractAndSaveTodos(noteId, content, noteTitle) {
    // First, delete existing todos for this note
    db.run('DELETE FROM todos WHERE note_id = ?', [noteId], (err) => {
        if (err) {
            console.error('Error deleting old todos:', err);
            return;
        }
        
        // Extract new todos
        const newTodos = extractTodos(noteId, content, noteTitle);
        
        // Insert new todos
        newTodos.forEach(todo => {
            db.run(
                'INSERT INTO todos (id, note_id, note_title, text, completed, created_date, completed_date, completion_comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [todo.id, todo.noteId, todo.noteTitle, todo.text, todo.completed, todo.createdDate, todo.completedDate, todo.completionComment]
            );
        });
    });
}

// API Routes

// Get all notes
app.get('/api/notes', (req, res) => {
    db.all('SELECT * FROM notes ORDER BY date DESC', (err, rows) => {
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

// Get all todos
app.get('/api/todos', (req, res) => {
    db.all('SELECT * FROM todos ORDER BY created_date DESC', (err, rows) => {
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

// Update todo completion status
app.put('/api/todos/:id', (req, res) => {
    const { id } = req.params;
    const { completed, completionComment } = req.body;
    const completedDate = completed ? new Date().toISOString() : null;
    
    db.run(
        'UPDATE todos SET completed = ?, completed_date = ?, completion_comment = ? WHERE id = ?',
        [completed, completedDate, completionComment || null, id],
        function(err) {
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
        }
    );
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