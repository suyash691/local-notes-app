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