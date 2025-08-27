# Notes & TODOs App with SQLite

<<<<<<< HEAD
A comprehensive notes and TODO tracking application with SQLite database backend and Docker support.

## Features

- 📝 **Rich Note Management**: Create, edit, and delete notes with full Markdown support
- ✅ **Smart TODO System**: 
  - Automatic TODO extraction from notes (under `TODO` markdown headings)
  - Priority support with markdown syntax: `[H]`, `[M]`, `[L]` or `!!!`, `!!`, `!`
  - Standalone TODOs (not tied to notes)
  - Edit TODOs with automatic note synchronization
- 🗄️ **Persistent Storage**: SQLite database with automatic migrations
- 🔍 **Advanced Search**: 
  - Search notes by content, title
  - Tag-specific search with `tag:tagname` syntax
  - TODO search functionality
- 📊 **TODO Management**: Completion tracking, priority sorting, progress indicators
- 🐳 **Docker Ready**: Full containerization with volume mounts for data persistence

## Quick Start Options

### Option 1: Docker (Recommended)

1. **Clone and run with Docker:**
   ```bash
   # Build and start the container
   docker-compose up -d
   
   # Create data directory for persistence (optional - will be created automatically)
   mkdir -p ./data
   ```
=======
A notes and TODO tracking application with SQLite database backend. Local use only.

## Features

- 📝 Create, edit, and delete notes with Markdown support
- ✅ Automatic TODO extraction from notes (under `TODO` markdown headings)
- 🗄️ SQLite database for persistent data storage
- 🔍 Search and filter notes by content, tags, and date
- 📋 TODO management with completion tracking
- 📊 TODO progress tracking per note
>>>>>>> 0e6ae8659967e1ed7ba5e2e65f5be31047014a1c

2. **Access the application:**
   Open `http://localhost:3000` in your browser

<<<<<<< HEAD
3. **Data persistence:**
   Your database will be stored in `./data/notes.db` on your local machine
=======
- Node.js
>>>>>>> 0e6ae8659967e1ed7ba5e2e65f5be31047014a1c

### Option 2: Local Development

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

<<<<<<< HEAD
## Docker Commands

```bash
# Build and start in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down

# Rebuild after code changes
docker-compose up --build -d

# Remove everything including volumes (⚠️ This will delete your data!)
docker-compose down -v
```

## TODO Priority Syntax

When creating TODOs in markdown notes, you can specify priority using these formats:

**High Priority:**
- `- [H] Critical task` or `- [HIGH] Critical task`
- `- !!! Critical task`

**Medium Priority (default):**
- `- [M] Normal task` or `- [MEDIUM] Normal task`  
- `- !! Normal task`
- `- Normal task` (no prefix)

**Low Priority:**
- `- [L] Low priority task` or `- [LOW] Low priority task`
- `- ! Low priority task`

### Example Note with TODOs and Priorities
=======
### Example Note with TODOs
>>>>>>> 0e6ae8659967e1ed7ba5e2e65f5be31047014a1c

```markdown
# My Project Notes

This is a note about my project with prioritized tasks.

## TODO
- [H] Fix critical security vulnerability
- !!! Deploy hotfix to production
- !! Write API documentation  
- [M] Update user guide
- Test the application
- [L] Clean up old log files
- ! Update README badges

## Notes
TODOs are automatically extracted and can be managed from the TODOs tab.
```

## Database

The application uses SQLite with automatic migrations:

- **notes**: Stores note data (id, title, content, tags, date)
- **todos**: Stores extracted TODOs (id, note_id, text, completed, priority, etc.)
- **standalone_todos**: Stores independent TODOs not tied to notes
- **migrations**: Tracks database schema versions

**Database Location:**
- **Docker**: `./data/notes.db` (mounted volume)
- **Local**: `./notes.db` (project directory)

## API Endpoints

### Notes
- `GET /api/notes` - Get all notes (supports `?search=` parameter)
- `GET /api/notes/:id` - Get specific note
- `POST /api/notes` - Create new note
- `PUT /api/notes/:id` - Update note
- `DELETE /api/notes/:id` - Delete note
<<<<<<< HEAD

### TODOs
- `GET /api/todos` - Get all note-based todos (supports `?search=` parameter)
- `PUT /api/todos/:id` - Update todo completion status
- `PUT /api/todos/:id/edit` - Edit todo text/priority (updates source note)

### Standalone TODOs
- `GET /api/standalone-todos` - Get standalone todos (supports `?search=` parameter)
- `POST /api/standalone-todos` - Create new standalone todo
- `PUT /api/standalone-todos/:id` - Update standalone todo
- `DELETE /api/standalone-todos/:id` - Delete standalone todo

## Search Features

- **General search**: Search notes by title and content
- **Tag search**: Use `tag:work` to search for specific tags
- **TODO search**: Search across all TODO text and source note titles
=======
- `GET /api/todos` - Get all todos
- `PUT /api/todos/:id` - Update todo status
>>>>>>> 0e6ae8659967e1ed7ba5e2e65f5be31047014a1c
