const path = require('path');

class MigrationManager {
    constructor(db) {
        this.db = db;
        this.migrations = [
            {
                version: 1,
                name: 'initial_schema',
                up: () => {
                    // This represents the initial schema - already exists
                    return Promise.resolve();
                },
                down: () => {
                    return Promise.resolve();
                }
            },
            {
                version: 2,
                name: 'add_todo_priority_and_create_todos',
                up: () => {
                    return new Promise((resolve, reject) => {
                        this.db.serialize(() => {
                            // Add priority column to todos table
                            this.db.run(`ALTER TABLE todos ADD COLUMN priority TEXT DEFAULT 'medium'`, (err) => {
                                if (err && !err.message.includes('duplicate column name')) {
                                    reject(err);
                                    return;
                                }
                                
                                // Create standalone todos table for todos not tied to notes
                                this.db.run(`
                                    CREATE TABLE IF NOT EXISTS standalone_todos (
                                        id TEXT PRIMARY KEY,
                                        text TEXT NOT NULL,
                                        priority TEXT DEFAULT 'medium',
                                        completed BOOLEAN DEFAULT 0,
                                        created_date TEXT NOT NULL,
                                        completed_date TEXT,
                                        completion_comment TEXT
                                    )
                                `, (err) => {
                                    if (err) {
                                        reject(err);
                                        return;
                                    }
                                    resolve();
                                });
                            });
                        });
                    });
                },
                down: () => {
                    return new Promise((resolve, reject) => {
                        this.db.serialize(() => {
                            // Note: SQLite doesn't support dropping columns easily
                            // For rollback we would need to recreate the table
                            this.db.run('DROP TABLE IF EXISTS standalone_todos', (err) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                resolve();
                            });
                        });
                    });
                }
            },
            {
                version: 3,
                name: 'merge_standalone_and_normal_todos',
                up: () => {
                    return new Promise((resolve, reject) => {
                        this.db.serialize(() => {
                            // First, copy all standalone todos to the main todos table
                            this.db.run(`
                                INSERT INTO todos (id, note_id, note_title, text, completed, created_date, completed_date, completion_comment, priority)
                                SELECT id, NULL, NULL, text, completed, created_date, completed_date, completion_comment, priority
                                FROM standalone_todos
                            `, (err) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                
                                // Drop the standalone_todos table
                                this.db.run('DROP TABLE IF EXISTS standalone_todos', (err) => {
                                    if (err) {
                                        reject(err);
                                        return;
                                    }
                                    resolve();
                                });
                            });
                        });
                    });
                },
                down: () => {
                    return new Promise((resolve, reject) => {
                        this.db.serialize(() => {
                            // Recreate standalone_todos table
                            this.db.run(`
                                CREATE TABLE IF NOT EXISTS standalone_todos (
                                    id TEXT PRIMARY KEY,
                                    text TEXT NOT NULL,
                                    priority TEXT DEFAULT 'medium',
                                    completed BOOLEAN DEFAULT 0,
                                    created_date TEXT NOT NULL,
                                    completed_date TEXT,
                                    completion_comment TEXT
                                )
                            `, (err) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                
                                // Move standalone todos back
                                this.db.run(`
                                    INSERT INTO standalone_todos (id, text, priority, completed, created_date, completed_date, completion_comment)
                                    SELECT id, text, priority, completed, created_date, completed_date, completion_comment
                                    FROM todos WHERE note_id IS NULL
                                `, (err) => {
                                    if (err) {
                                        reject(err);
                                        return;
                                    }
                                    
                                    // Delete from todos table
                                    this.db.run('DELETE FROM todos WHERE note_id IS NULL', (err) => {
                                        if (err) {
                                            reject(err);
                                            return;
                                        }
                                        resolve();
                                    });
                                });
                            });
                        });
                    });
                }
            },
            {
                version: 4,
                name: 'normalize_tags_into_separate_table',
                up: () => {
                    return new Promise((resolve, reject) => {
                        this.db.serialize(() => {
                            // Create tags table
                            this.db.run(`
                                CREATE TABLE IF NOT EXISTS tags (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    name TEXT NOT NULL UNIQUE,
                                    created_date TEXT NOT NULL
                                )
                            `, (err) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                
                                // Create note_tags junction table
                                this.db.run(`
                                    CREATE TABLE IF NOT EXISTS note_tags (
                                        note_id TEXT NOT NULL,
                                        tag_id INTEGER NOT NULL,
                                        PRIMARY KEY (note_id, tag_id),
                                        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
                                        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                                    )
                                `, (err) => {
                                    if (err) {
                                        reject(err);
                                        return;
                                    }
                                    
                                    // Create todo_tags junction table
                                    this.db.run(`
                                        CREATE TABLE IF NOT EXISTS todo_tags (
                                            todo_id TEXT NOT NULL,
                                            tag_id INTEGER NOT NULL,
                                            PRIMARY KEY (todo_id, tag_id),
                                            FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
                                            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                                        )
                                    `, (err) => {
                                        if (err) {
                                            reject(err);
                                            return;
                                        }
                                        
                                        // Migrate existing tags from notes
                                        this.db.all('SELECT id, tags FROM notes WHERE tags IS NOT NULL AND tags != ""', (err, rows) => {
                                            if (err) {
                                                reject(err);
                                                return;
                                            }
                                            
                                            let processed = 0;
                                            const total = rows.length;
                                            
                                            if (total === 0) {
                                                resolve();
                                                return;
                                            }
                                            
                                            rows.forEach(row => {
                                                try {
                                                    const tags = JSON.parse(row.tags || '[]');
                                                    let tagProcessed = 0;
                                                    const totalTags = tags.length;
                                                    
                                                    if (totalTags === 0) {
                                                        processed++;
                                                        if (processed === total) resolve();
                                                        return;
                                                    }
                                                    
                                                    tags.forEach(tagName => {
                                                        // Insert or get tag
                                                        this.db.run(
                                                            'INSERT OR IGNORE INTO tags (name, created_date) VALUES (?, ?)',
                                                            [tagName, new Date().toISOString()],
                                                            function(err) {
                                                                if (err) {
                                                                    reject(err);
                                                                    return;
                                                                }
                                                                
                                                                // Get tag ID
                                                                this.db.get(
                                                                    'SELECT id FROM tags WHERE name = ?',
                                                                    [tagName],
                                                                    (err, tag) => {
                                                                        if (err) {
                                                                            reject(err);
                                                                            return;
                                                                        }
                                                                        
                                                                        // Link note to tag
                                                                        this.db.run(
                                                                            'INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)',
                                                                            [row.id, tag.id],
                                                                            (err) => {
                                                                                if (err) {
                                                                                    reject(err);
                                                                                    return;
                                                                                }
                                                                                
                                                                                tagProcessed++;
                                                                                if (tagProcessed === totalTags) {
                                                                                    processed++;
                                                                                    if (processed === total) resolve();
                                                                                }
                                                                            }
                                                                        );
                                                                    }
                                                                );
                                                            }.bind(this)
                                                        );
                                                    });
                                                } catch (parseErr) {
                                                    // Skip invalid JSON tags
                                                    processed++;
                                                    if (processed === total) resolve();
                                                }
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                },
                down: () => {
                    return new Promise((resolve, reject) => {
                        this.db.serialize(() => {
                            this.db.run('DROP TABLE IF EXISTS todo_tags', (err) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                
                                this.db.run('DROP TABLE IF EXISTS note_tags', (err) => {
                                    if (err) {
                                        reject(err);
                                        return;
                                    }
                                    
                                    this.db.run('DROP TABLE IF EXISTS tags', (err) => {
                                        if (err) {
                                            reject(err);
                                            return;
                                        }
                                        resolve();
                                    });
                                });
                            });
                        });
                    });
                }
            }
        ];
    }

    async getCurrentVersion() {
        return new Promise((resolve, reject) => {
            // Create migrations table if it doesn't exist
            this.db.run(`
                CREATE TABLE IF NOT EXISTS migrations (
                    version INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Get current version
                this.db.get('SELECT MAX(version) as version FROM migrations', (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(row && row.version ? row.version : 0);
                });
            });
        });
    }

    async runMigrations() {
        try {
            const currentVersion = await this.getCurrentVersion();
            console.log(`Current database version: ${currentVersion}`);
            
            const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);
            
            if (pendingMigrations.length === 0) {
                console.log('Database is up to date');
                return;
            }
            
            console.log(`Running ${pendingMigrations.length} migrations...`);
            
            for (const migration of pendingMigrations) {
                console.log(`Running migration ${migration.version}: ${migration.name}`);
                
                try {
                    await migration.up();
                    
                    // Record successful migration
                    await new Promise((resolve, reject) => {
                        this.db.run(
                            'INSERT INTO migrations (version, name) VALUES (?, ?)',
                            [migration.version, migration.name],
                            (err) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            }
                        );
                    });
                    
                    console.log(`Migration ${migration.version} completed successfully`);
                } catch (error) {
                    console.error(`Migration ${migration.version} failed:`, error);
                    throw error;
                }
            }
            
            console.log('All migrations completed successfully');
        } catch (error) {
            console.error('Migration failed:', error);
            throw error;
        }
    }
}

module.exports = MigrationManager;