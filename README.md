# Notes & TODOs App with SQLite

A full-stack notes and TODO tracking application with SQLite database backend.

## Features

- 📝 Create, edit, and delete notes with Markdown support
- ✅ Automatic TODO extraction from notes (under `## TODO` headings)
- 🗄️ SQLite database for persistent data storage
- 🔍 Search and filter notes by content, tags, and date
- 📋 TODO management with completion tracking
- 🎨 Modern, responsive UI
- 📊 TODO progress tracking per note

## Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```
   
   Or for development with auto-restart:
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

## How it Works

### Notes
- Create notes with full Markdown support
- Notes are automatically saved to SQLite database
- Search by title, content, or tags
- Filter by date range
- Group notes by creation date

### TODO Tracking
- Add a `## TODO` heading to any note
- List items under the heading will automatically become trackable TODOs
- TODOs appear in the dedicated TODO tab
- Mark TODOs as complete with optional completion comments
- Filter TODOs by status (Active/Completed/All)

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

## File Structure

```
├── server.js          # Node.js/Express server
├── index.html         # Frontend application
├── package.json       # Dependencies and scripts
├── notes.db          # SQLite database (created automatically)
└── README.md         # This file
```

## Development

The application consists of:

1. **Backend** (`server.js`): Express.js server with SQLite database
2. **Frontend** (`index.html`): Single-page application with vanilla JavaScript
3. **Database**: SQLite for data persistence

## Production Considerations

For production deployment:

1. Add environment variable support for configuration
2. Implement proper error logging
3. Add authentication if needed
4. Use a process manager like PM2
5. Set up proper backup strategy for the SQLite database
6. Consider using a reverse proxy (nginx/Apache)

## Troubleshooting

**Database Issues:**
- The SQLite database is created automatically on first run
- If you encounter database errors, try deleting `notes.db` to recreate it

**Port Conflicts:**
- The server runs on port 3000 by default
- Set the `PORT` environment variable to use a different port

**Dependencies:**
- Run `npm install` if you get module not found errors
- Make sure you have Node.js 14+ installed