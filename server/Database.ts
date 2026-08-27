import sqlite3 from "sqlite3";
import { createHash } from "crypto";

interface PlayerDelta {
	player: string;
	delta: number;
}

export class Database {
	private db: sqlite3.Database;

	constructor(filepath: string) {
		this.db = new sqlite3.Database(filepath);
		this.initializeTables();
	}

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
		`);
	}

	private hashPassword(password: string): string {
		return createHash("sha256")
			.update(password)
			.digest("hex");
	}

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

