import sqlite3 from "sqlite3";
import { createHash, randomBytes } from "crypto";

interface PlayerDelta {
	player: string;
	delta: number;
}

export interface QuickConnectionKeyRecord {
	key: string;
	user: string;
	createdAt: string;
	expiresAt: string | null;
}

export class Database {
	private db: sqlite3.Database;

	constructor(filepath: string) {
		this.db = new sqlite3.Database(filepath);
		this.initializeTables();
	}

	/**
	 * Initializes all database tables including the new QuickConnectionKey table.
	 */
	private initializeTables(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS User (
				pseudo TEXT PRIMARY KEY,
				password TEXT NOT NULL
			);

			CREATE TABLE IF NOT EXISTS Gamemode (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL
			);

			CREATE TABLE IF NOT EXISTS Progression (
				gamemode TEXT,
				user TEXT,
				trophees INTEGER DEFAULT 0 CHECK(trophees >= 0),
				PRIMARY KEY (gamemode, user),
				FOREIGN KEY (gamemode) REFERENCES Gamemode(id),
				FOREIGN KEY (user) REFERENCES User(pseudo)
			);

			CREATE TABLE IF NOT EXISTS QuickConnectionKey (
				key TEXT PRIMARY KEY,
				user TEXT NOT NULL,
				createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
				expiresAt DATETIME,
				FOREIGN KEY (user) REFERENCES User(pseudo) ON DELETE CASCADE
			);
		`);
	}

	/**
	 * Hashes a plain text password using SHA-256.
	 */
	private hashPassword(password: string): string {
		return createHash("sha256")
			.update(password)
			.digest("hex");
	}

	/**
	 * Generates a cryptographically secure random token key.
	 */
	private generateRandomKey(): string {
		return randomBytes(32).toString("hex");
	}

	// ==========================================
	// QuickConnection KEY METHODS
	// ==========================================

	/**
	 * Generates and stores a new QuickConnection key for a given user.
	 * @param pseudo Username associated with the key.
	 * @param expiresInDays Optional duration before the key expires.
	 */
	createKey(pseudo: string, expiresInDays?: number): Promise<string> {
		return new Promise((resolve, reject) => {
			const key = this.generateRandomKey();
			let expiresAt: string | null = null;

			if (expiresInDays !== undefined) {
				const expDate = new Date();
				expDate.setDate(expDate.getDate() + expiresInDays);
				expiresAt = expDate.toISOString();
			}

			this.db.run(
				`INSERT INTO QuickConnectionKey (key, user, expiresAt) VALUES (?, ?, ?)`,
				[key, pseudo, expiresAt],
				(error) => {
					if (error) {
						reject(error);
						return;
					}
					resolve(key);
				}
			);
		});
	}

	/**
	 * Validates whether an QuickConnection key exists and has not expired.
	 */
	validateKey(key: string): Promise<boolean> {
		return new Promise((resolve, reject) => {
			this.db.get<{ count: number }>(
				`
				SELECT COUNT(*) as count 
				FROM QuickConnectionKey 
				WHERE key = ? 
				  AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)
				`,
				[key],
				(error, row) => {
					if (error) {
						reject(error);
						return;
					}
					resolve((row?.count ?? 0) > 0);
				}
			);
		});
	}

	/**
	 * Retrieves the username attached to a valid QuickConnection key.
	 */
	getUserFromKey(key: string): Promise<string | null> {
		return new Promise((resolve, reject) => {
			this.db.get<{ user: string }>(
				`
				SELECT user 
				FROM QuickConnectionKey 
				WHERE key = ? 
				  AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)
				`,
				[key],
				(error, row) => {
					if (error) {
						reject(error);
						return;
					}
					resolve(row ? row.user : null);
				}
			);
		});
	}

	/**
	 * Revokes/deletes a specific QuickConnection key.
	 */
	revokeKey(key: string): Promise<boolean> {
		return new Promise((resolve, reject) => {
			this.db.run(
				`DELETE FROM QuickConnectionKey WHERE key = ?`,
				[key],
				function (error) {
					if (error) {
						reject(error);
						return;
					}
					resolve(this.changes > 0);
				}
			);
		});
	}

	/**
	 * Revokes all QuickConnection keys associated with a given user.
	 */
	revokeAllUserKeys(pseudo: string): Promise<number> {
		return new Promise((resolve, reject) => {
			this.db.run(
				`DELETE FROM QuickConnectionKey WHERE user = ?`,
				[pseudo],
				function (error) {
					if (error) {
						reject(error);
						return;
					}
					resolve(this.changes);
				}
			);
		});
	}

	/**
	 * Fetches all keys belonging to a user.
	 */
	getUserKeys(pseudo: string): Promise<QuickConnectionKeyRecord[]> {
		return new Promise((resolve, reject) => {
			this.db.all<QuickConnectionKeyRecord>(
				`SELECT key, user, createdAt, expiresAt FROM QuickConnectionKey WHERE user = ?`,
				[pseudo],
				(error, rows) => {
					if (error) {
						reject(error);
						return;
					}
					resolve(rows ?? []);
				}
			);
		});
	}

	/**
	 * Removes all expired QuickConnection keys from the database.
	 */
	cleanupExpiredKeys(): Promise<number> {
		return new Promise((resolve, reject) => {
			this.db.run(
				`DELETE FROM QuickConnectionKey WHERE expiresAt IS NOT NULL AND expiresAt <= CURRENT_TIMESTAMP`,
				function (error) {
					if (error) {
						reject(error);
						return;
					}
					resolve(this.changes);
				}
			);
		});
	}

	// ==========================================
	// USER & GAME METHODS
	// ==========================================

	/**
	 * Creates a new user and sets default progression for all existing gamemodes.
	 */
	addUser(pseudo: string, password: string): Promise<boolean> {
		return new Promise((resolve, reject) => {
			const hashedPassword = this.hashPassword(password);

			this.db.serialize(() => {
				this.db.run("BEGIN TRANSACTION");

				this.db.run(
					"INSERT INTO User (pseudo, password) VALUES (?, ?)",
					[pseudo, hashedPassword],
					(error) => {
						if (error) {
							this.db.run("ROLLBACK");
							resolve(false);
							return;
						}

						this.db.run(
							`
							INSERT INTO Progression (gamemode, user, trophees)
							SELECT id, ?, 0 FROM Gamemode
							`,
							[pseudo],
							(error) => {
								if (error) {
									this.db.run("ROLLBACK");
									resolve(false);
									return;
								}

								this.db.run("COMMIT", (error) => {
									if (error) {
										resolve(false);
										return;
									}
									resolve(true);
								});
							}
						);
					}
				);
			});
		});
	}

	/**
	 * Checks user credentials against the stored hashed password.
	 */
	checkPassword(pseudo: string, password: string): Promise<boolean> {
		return new Promise((resolve, reject) => {
			this.db.get<{ password: string }>(
				"SELECT password FROM User WHERE pseudo = ?",
				[pseudo],
				(error, row) => {
					if (error) {
						reject(error);
						return;
					}

					if (!row) {
						resolve(false);
						return;
					}

					resolve(
						row.password === this.hashPassword(password)
					);
				}
			);
		});
	}

	/**
	 * Updates progression trophies for multiple players in a given gamemode.
	 */
	giveTrophees(
		gamemode: string,
		playerDeltas: PlayerDelta[]
	): Promise<{ player: string; trophees: number }[]> {
		return new Promise((resolve, reject) => {
			this.db.serialize(() => {
				this.db.run("BEGIN TRANSACTION");

				const statement = this.db.prepare(`
					UPDATE Progression
					SET trophees = MAX(0, trophees + ?)
					WHERE gamemode = ? AND user = ?
				`);

				for (const item of playerDeltas) {
					statement.run([
						item.delta,
						gamemode,
						item.player
					]);
				}

				statement.finalize((error) => {
					if (error) {
						this.db.run("ROLLBACK");
						reject(new Error(`Failed to update trophees: ${error.message}`));
						return;
					}

					this.db.all(
						`
						SELECT user AS player, trophees
						FROM Progression
						WHERE gamemode = ?
						AND user IN (${playerDeltas.map(() => "?").join(",")})
						`,
						[gamemode, ...playerDeltas.map(p => p.player)],
						(error, rows: { player: string; trophees: number }[]) => {
							if (error) {
								this.db.run("ROLLBACK");
								reject(error);
								return;
							}

							this.db.run("COMMIT", (error) => {
								if (error) {
									reject(error);
									return;
								}

								resolve(rows);
							});
						}
					);
				});
			});
		});
	}

	/**
	 * Registers a new gamemode and creates default progression rows for existing users.
	 */
	addGamemode(
		modeId: string,
		name: string
	): Promise<void> {
		return new Promise((resolve, reject) => {
			this.db.serialize(() => {
				this.db.run("BEGIN TRANSACTION");

				this.db.run(
					"INSERT INTO Gamemode (id, name) VALUES (?, ?)",
					[modeId, name],
					(error) => {
						if (error) {
							this.db.run("ROLLBACK");
							reject(
								new Error(
									`Gamemode '${modeId}' already exists.`
								)
							);
							return;
						}

						this.db.run(
							`
							INSERT INTO Progression (gamemode, user, trophees)
							SELECT ?, pseudo, 0 FROM User
							`,
							[modeId],
							(error) => {
								if (error) {
									this.db.run("ROLLBACK");
									reject(error);
									return;
								}

								this.db.run("COMMIT", (error) => {
									if (error) {
										reject(error);
										return;
									}

									resolve();
								});
							}
						);
					}
				);
			});
		});
	}

	/**
	 * Gets current trophies for a specific user and gamemode.
	 */
	getTrophees(pseudo: string, gamemode: string): Promise<number> {
		return new Promise((resolve, reject) => {
			this.db.get<{ trophees: number }>(
				"SELECT trophees FROM Progression WHERE user = ? AND gamemode = ?",
				[pseudo, gamemode],
				(error, row) => {
					if (error) {
						reject(error);
						return;
					}

					resolve(row?.trophees ?? 0);
				}
			);
		});
	}

	/**
	 * Closes the SQLite database connection.
	 */
	close(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.db.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});
	}
}

let resolveDb!: (db: Database) => void;

export const database: Promise<Database> = new Promise((resolve) => {
	resolveDb = resolve;
});

export function initDb(filepath: string) {
	const database = new Database(filepath);
	resolveDb(database);
}

