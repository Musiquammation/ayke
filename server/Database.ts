import sqlite3 from "sqlite3";
import { createHash, randomBytes } from "crypto";

interface PlayerDelta {
	player: string;
	delta: number;
}

interface QuickConnectionKeyRecord {
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
	 * Initializes all database tables if they do not already exist.
	 * Includes User, Gamemode, Progression, QuickConnectionKey, Skin, and SkinUnlock tables.
	 */
	private initializeTables(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS User (
				pseudo TEXT PRIMARY KEY,
				password TEXT NOT NULL
			);

			CREATE TABLE IF NOT EXISTS Gamemode (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				defaultSkin TEXT
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

			CREATE TABLE IF NOT EXISTS Skin (
				gamemode TEXT,
				id TEXT,
				PRIMARY KEY (gamemode, id),
				FOREIGN KEY (gamemode) REFERENCES Gamemode(id)
			);

			CREATE TABLE IF NOT EXISTS SkinUnlock (
				gamemode TEXT,
				skinId TEXT,
				user TEXT,
				PRIMARY KEY (gamemode, skinId, user),
				FOREIGN KEY (gamemode, skinId) REFERENCES Skin(gamemode, id),
				FOREIGN KEY (gamemode, user) REFERENCES Progression(gamemode, user)
			);
		`);
	}

	/**
	 * Hashes a plain text password using SHA-256 algorithm.
	 * @param password The plain text password.
	 * @returns The hashed password in hexadecimal format.
	 */
	private hashPassword(password: string): string {
		return createHash("sha256")
			.update(password)
			.digest("hex");
	}

	/**
	 * Generates a cryptographically secure random token key (64 characters long).
	 * @returns The random token in hexadecimal format.
	 */
	private generateRandomKey(): string {
		return randomBytes(32).toString("hex");
	}

	// ==========================================
	// QUICK CONNECTION KEY METHODS
	// ==========================================

	/**
	 * Generates and stores a new QuickConnection key for a given user.
	 * @param pseudo Username associated with the key.
	 * @param expiresInDays Optional duration in days before the key expires.
	 * @returns A promise that resolves to the generated key.
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
	 * Validates whether a QuickConnection key exists and has not expired.
	 * @param key The token to validate.
	 * @returns A promise resolving to true if valid, false otherwise.
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
	 * @param key The connection key.
	 * @returns A promise resolving to the username, or null if invalid/expired.
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
	 * Revokes (deletes) a specific QuickConnection key from the database.
	 * @param key The key to revoke.
	 * @returns A promise resolving to true if a key was deleted, false otherwise.
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
	 * Revokes all QuickConnection keys associated with a specific user.
	 * @param pseudo The username whose keys should be revoked.
	 * @returns A promise resolving to the number of deleted keys.
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
	 * Fetches all connection keys belonging to a specific user.
	 * @param pseudo The username.
	 * @returns A promise resolving to an array of key records.
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
	 * Removes all expired QuickConnection keys from the database to save space.
	 * @returns A promise resolving to the number of keys deleted.
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
	 * Creates a new user and sets default progression (0 trophies) for all existing gamemodes.
	 * Uses simple sequential queries to avoid nested transaction collisions.
	 * @param pseudo The new username.
	 * @param password The plain text password (will be hashed).
	 * @returns A promise resolving to true if successful, false if the user already exists.
	 */
	addUser(pseudo: string, password: string): Promise<boolean> {
		return new Promise((resolve) => {
			const hashedPassword = this.hashPassword(password);

			this.db.run(
				"INSERT INTO User (pseudo, password) VALUES (?, ?)",
				[pseudo, hashedPassword],
				(error) => {
					if (error) {
						// Usually happens if the user already exists (PRIMARY KEY constraint)
						resolve(false);
						return;
					}

					// Setup default progression for this new user on all gamemodes
					this.db.run(
						`
						INSERT INTO Progression (gamemode, user, trophees)
						SELECT id, ?, 0
						FROM Gamemode
						`,
						[pseudo],
						(err) => {
							resolve(!err);
						}
					);
				}
			);
		});
	}

	/**
	 * Checks user credentials against the stored hashed password.
	 * @param pseudo The username.
	 * @param password The plain text password to check.
	 * @returns A promise resolving to true if credentials are valid, false otherwise.
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

					resolve(row.password === this.hashPassword(password));
				}
			);
		});
	}

	/**
	 * Updates progression trophies for multiple players in a given gamemode at once.
	 * @param gamemode The gamemode ID.
	 * @param playerDeltas An array of player names and trophy changes (delta).
	 * @returns A promise resolving to the updated player list with their new trophies.
	 */
	giveTrophees(
		gamemode: string,
		playerDeltas: PlayerDelta[]
	): Promise<{ player: string; trophees: number }[]> {
		return new Promise((resolve, reject) => {
			if (playerDeltas.length === 0) {
				resolve([]);
				return;
			}

			// Ensure queries run sequentially on the connection
			this.db.serialize(() => {
				const statement = this.db.prepare(`
					UPDATE Progression
					SET trophees = MAX(0, trophees + ?)
					WHERE gamemode = ? AND user = ?
				`);

				// Apply delta to each player
				for (const item of playerDeltas) {
					statement.run([item.delta, gamemode, item.player]);
				}

				// Finalize the statement and fetch the updated records
				statement.finalize((error) => {
					if (error) {
						reject(new Error(`Failed to update trophees: ${error.message}`));
						return;
					}

					const placeholders = playerDeltas.map(() => "?").join(",");
					const queryParams = [gamemode, ...playerDeltas.map((p) => p.player)];

					this.db.all(
						`
						SELECT user AS player, trophees
						FROM Progression
						WHERE gamemode = ?
						AND user IN (${placeholders})
						`,
						queryParams,
						(error, rows: { player: string; trophees: number }[]) => {
							if (error) {
								reject(error);
								return;
							}
							resolve(rows);
						}
					);
				});
			});
		});
	}

	/**
	 * Registers a new gamemode if it doesn't exist, and creates default progression rows
	 * (0 trophies) for all existing users.
	 * Uses INSERT OR IGNORE to prevent overlapping transactions errors.
	 * @param modeId The unique gamemode identifier.
	 * @param name The display name of the gamemode.
	 */
	enshureGamemode(
		modeId: string,
		name: string,
		defaultSkin: string | null = null
	): Promise<void> {
		return new Promise((resolve, reject) => {
			// Insert gamemode if it doesn't exist yet
			this.db.run(
				`
				INSERT OR IGNORE INTO Gamemode (id, name, defaultSkin)
				VALUES (?, ?, ?)
				`,
				[modeId, name, defaultSkin],
				(error) => {
					if (error) {
						reject(error);
						return;
					}

					// Insert 0 trophies for all users for this gamemode,
					// ignoring if they already exist
					this.db.run(
						`
						INSERT OR IGNORE INTO Progression (gamemode, user, trophees)
						SELECT ?, pseudo, 0 FROM User
						`,
						[modeId],
						(error) => {
							if (error) {
								reject(error);
								return;
							}

							if (defaultSkin === null) {
								resolve();
								return;
							}

							// Unlock the default skin for all users
							this.db.run(
								`
								INSERT OR IGNORE INTO SkinUnlock (gamemode, skinId, user)
								SELECT ?, ?, user
								FROM Progression
								WHERE gamemode = ?
								`,
								[modeId, defaultSkin, modeId],
								(error) => {
									if (error) {
										reject(error);
										return;
									}

									resolve();
								}
							);
						}
					);
				}
			);
		});
	}

	/**
	 * Retrieves the current number of trophies for a specific user and gamemode.
	 * @param pseudo The username.
	 * @param gamemode The gamemode ID.
	 * @returns A promise resolving to the amount of trophies.
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

	// ==========================================
	// SKIN METHODS
	// ==========================================

	/**
	 * Ensures that all given skins exist for a gamemode.
	 * If skinIds is not empty, the first skin is assigned to all existing progressions
	 * of the gamemode.
	 *
	 * @param gamemode The gamemode ID.
	 * @param skinIds The skin IDs to register.
	 */
	enshureSkins(
		gamemode: string,
		skinIds: string[]
	): Promise<void> {
		return new Promise((resolve, reject) => {
			if (skinIds.length === 0) {
				resolve();
				return;
			}

			this.db.serialize(() => {
				const statement = this.db.prepare(`
					INSERT OR IGNORE INTO Skin (gamemode, id)
					VALUES (?, ?)
				`);

				for (const skinId of skinIds) {
					statement.run(gamemode, skinId);
				}

				statement.finalize((err) => {
					if (err) {
						reject(err);
						return;
					}

					resolve();
				});

			});
		});
	}

	/**
	 * Checks whether a user has unlocked a skin.
	 *
	 * @param gamemode The gamemode ID.
	 * @param skinId The skin ID.
	 * @param user The username.
	 * @returns A promise resolving to true if the skin is unlocked.
	 */
	hasSkin(
		gamemode: string,
		skinId: string,
		user: string
	): Promise<boolean> {
		return new Promise((resolve, reject) => {
			this.db.get<{ count: number }>(
				`
				SELECT COUNT(*) AS count
				FROM SkinUnlock
				WHERE gamemode = ?
				  AND skinId = ?
				  AND user = ?
				`,
				[gamemode, skinId, user],
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
	 * Unlocks a skin for a user.
	 *
	 * @param gamemode The gamemode ID.
	 * @param skinId The skin ID.
	 * @param user The username.
	 * @returns A promise resolving to true if the skin was unlocked,
	 *          or false if it was already unlocked.
	 */
	giveSkin(
		gamemode: string,
		skinId: string,
		user: string
	): Promise<boolean> {
		return new Promise((resolve, reject) => {
			this.db.run(
				`
				INSERT OR IGNORE INTO SkinUnlock (gamemode, skinId, user)
				VALUES (?, ?, ?)
				`,
				[gamemode, skinId, user],
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
	 * Retrieves all skins unlocked by a user for a specific gamemode.
	 *
	 * @param pseudo The username.
	 * @param gamemode The gamemode ID.
	 * @returns A promise resolving to an array of unlocked skin IDs.
	 */
	getUnlockedSkins(
		pseudo: string,
		gamemode: string
	): Promise<string[]> {
		return new Promise((resolve, reject) => {
			this.db.all<{ skinId: string }>(
				`
				SELECT skinId
				FROM SkinUnlock
				WHERE user = ?
				AND gamemode = ?

				UNION

				SELECT defaultSkin AS skinId
				FROM Gamemode
				WHERE id = ?
				AND defaultSkin IS NOT NULL
				`,
				[pseudo, gamemode, gamemode],
				(error, rows) => {
					if (error) {
						reject(error);
						return;
					}

					resolve(rows?.map(row => row.skinId) ?? []);
				}
			);
		});
	}

	/**
	 * Closes the SQLite database connection gracefully.
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

	// ==========================================
	// LEADERBOARD METHODS
	// ==========================================

	/**
	 * Retrieves paginated leaderboard entries.
	 * If gamemode is null, it aggregates total trophies across all gamemodes for each user.
	 *
	 * @param gamemode The specific gamemode ID, or null to get global rankings.
	 * @param page The pagination index (0-based).
	 * @returns A promise resolving to an array of top players and their scores.
	 */
	getLeaderboard(
		gamemode: string | null,
		page: number
	): Promise<{ pseudo: string; trophees: number }[]> {
		return new Promise((resolve, reject) => {
			const limit = 64;
			const offset = page * limit;

			if (gamemode) {
				this.db.all<{ pseudo: string; trophees: number }>(
					`
					SELECT user AS pseudo, trophees 
					FROM Progression 
					WHERE gamemode = ? 
					ORDER BY trophees DESC 
					LIMIT ? OFFSET ?
					`,
					[gamemode, limit, offset],
					(error, rows) => {
						if (error) {
							reject(error);
							return;
						}
						resolve(rows ?? []);
					}
				);
			} else {
				this.db.all<{ pseudo: string; trophees: number }>(
					`
					SELECT user AS pseudo, SUM(trophees) AS trophees 
					FROM Progression 
					GROUP BY user 
					ORDER BY trophees DESC 
					LIMIT ? OFFSET ?
					`,
					[limit, offset],
					(error, rows) => {
						if (error) {
							reject(error);
							return;
						}
						resolve(rows ?? []);
					}
				);
			}
		});
	}
}

// Global promise to safely await the database connection across modules
let resolveDb!: (db: Database) => void;

export const database: Promise<Database> = new Promise((resolve) => {
	resolveDb = resolve;
});

/**
 * Initializes the singleton Database instance.
 * @param filepath Path to the SQLite database file.
 */
export function initDb(filepath: string) {
	const dbInstance = new Database(filepath);
	resolveDb(dbInstance);
}
