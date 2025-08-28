# Notes App

A comprehensive notes application with SQLite database backend and Docker support.

## Features

- Create, edit, and delete notes with full Markdown support
- Automatic TODO extraction from notes (under `TODO` markdown headings)
  - Priority support with markdown syntax: `[H]`, `[M]`, `[L]` or `!!!`, `!!`, `!`
  - Standalone TODOs (not tied to notes)
  - Edit TODOs with automatic note synchronization
- SQLite database with automatic migrations
- Search notes and todos by content, title
- Tag-specific search with `tag:tagname` syntax

## Quick Start Options

### Option 1: Docker (Recommended)

1. **Clone and run with Docker:**
   ```bash
   # Build and start the container
   docker-compose up -d
   
   # Create data directory for persistence (optional - will be created automatically)
   mkdir -p ./data
   ```

2. **Access the application:**
   Open `http://localhost:3000` in your browser

3. **Data persistence:**
   Your database will be stored in `./data/notes.db` on your local machine

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

### Core Tables
- **notes**: Stores note data (id, title, content, date, updated_at)
- **todos**: Stores all TODOs - both from notes and standalone (id, note_id, note_title, text, completed, priority, created_date, completed_date, completion_comment)

### Tag System (Normalized)
- **tags**: Stores unique tag names (id, name, created_date)
- **note_tags**: Junction table linking notes to tags (note_id, tag_id)
- **todo_tags**: Junction table linking todos to tags (todo_id, tag_id)

### System
- **migrations**: Tracks database schema versions for automatic updates

**Database Location:**
- `./data/notes.db` (mounted volume in case of docker)

## API Endpoints

### Notes
- `GET /api/notes` - Get all notes (supports `?search=` parameter)
- `GET /api/notes/:id` - Get specific note
- `POST /api/notes` - Create new note
- `PUT /api/notes/:id` - Update note
- `DELETE /api/notes/:id` - Delete note

### TODOs
- `GET /api/todos` - Get all TODOs with optional filtering (supports `?search=`, `?tag=`, `?standalone=` parameters)
- `POST /api/todos` - Create new TODO (standalone or note-linked)
- `PUT /api/todos/:id` - Update todo completion status and priority
- `PUT /api/todos/:id/edit` - Edit todo text/priority (updates source note for note-based TODOs)
- `DELETE /api/todos/:id` - Delete TODO

### Tags
- `GET /api/tags` - Get all available tags
