# Notes & TODOs App with SQLite

A notes and TODO tracking application with SQLite database backend. Local use only.

## Features

- 📝 Create, edit, and delete notes with Markdown support
- ✅ Automatic TODO extraction from notes (under `TODO` markdown headings)
- 🗄️ SQLite database for persistent data storage
- 🔍 Search and filter notes by content, tags, and date
- 📋 TODO management with completion tracking
- 📊 TODO progress tracking per note

## Prerequisites

- Node.js

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

## How it Works

### Example Note with TODOs

```markdown
# My Project Notes

This is a note about my project with some important tasks.

## TODO
- Complete the database schema
- Write API documentation  
- Test the application
- Deploy to production

## Notes
Some additional notes here...
```

## Database

The application uses SQLite with the following tables:

- **notes**: Stores note data (id, title, content, tags, date)
- **todos**: Stores extracted TODOs (id, note_id, text, completed, etc.)

The database file (`notes.db`) is created automatically in the project directory.

## API Endpoints

- `GET /api/notes` - Get all notes
- `GET /api/notes/:id` - Get specific note
- `POST /api/notes` - Create new note
- `PUT /api/notes/:id` - Update note
- `DELETE /api/notes/:id` - Delete note
- `GET /api/todos` - Get all todos
- `PUT /api/todos/:id` - Update todo status