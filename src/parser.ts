// parser.ts
import { LogEntry, TimeSeriesData, ChartDataPoint } from './types';

export class LogParser {
	// Regex patterns based on provided log samples
	private static readonly dateRegex = /^\[(.*?)\]/;
	private static readonly serverStartRegex = /Server running on/;
	private static readonly serverStopRegex = /Server shutting down/;
	
	// Connections: New connection #0, (hint) #0 is 'test', User 'test' has disconnected, test has disconnected
	private static readonly connNewRegex = /New connection #(\d+)/;
	private static readonly connHintRegex = /\(hint\) #(\d+) is '([^']+)/;
	private static readonly disconnRegex = /(?:User ')?([^']*)'?(?: has)? disconnected/;

	// Games: Starting game #id for mode 'mode', Finished game #id
	private static readonly gameStartRegex = /Starting game (?:#(\d+) )?for mode '([^']+)'/;
	private static readonly gameEndRegex = /Finished game #(\d+)/;
	
	// Example for rewards (trophies/skins) - customize based on actual log format
	private static readonly rewardRegex = /Reward given: (skin|trophy) (\w+) to '([^']+)'/;

	public parseLogs(rawLogs: string, userRegexStr: string, gameRegexStr: string): TimeSeriesData {
		const lines = rawLogs.split('\n');
		const entries: LogEntry[] = [];

		// Parsing step
		for (const line of lines) {
			const dateMatch = line.match(LogParser.dateRegex);
			if (!dateMatch) continue;
			
			const timestamp = new Date(dateMatch[1]);
			if (isNaN(timestamp.getTime())) continue;

			if (LogParser.serverStartRegex.test(line)) {
				entries.push({ timestamp, type: 'server_start' });
			} else if (LogParser.serverStopRegex.test(line)) {
				entries.push({ timestamp, type: 'server_stop' });
			} else if (LogParser.connHintRegex.test(line)) {
				const match = line.match(LogParser.connHintRegex);
				entries.push({ timestamp, type: 'connection', details: { user: match![2] } });
			} else if (LogParser.disconnRegex.test(line)) {
				const match = line.match(LogParser.disconnRegex);
				entries.push({ timestamp, type: 'disconnection', details: { user: match![1] } });
			} else if (LogParser.gameStartRegex.test(line)) {
				const match = line.match(LogParser.gameStartRegex);
				entries.push({ timestamp, type: 'game_start', details: { id: match![1] || 'unknown', mode: match![2] } });
			} else if (LogParser.gameEndRegex.test(line)) {
				const match = line.match(LogParser.gameEndRegex);
				entries.push({ timestamp, type: 'game_stop', details: { id: match![1] } });
			}
		}

		return this.aggregateData(entries, userRegexStr, gameRegexStr);
	}

	private aggregateData(entries: LogEntry[], userRegexStr: string, gameRegexStr: string): TimeSeriesData {
		const data: TimeSeriesData = {
			serverStatus: [],
			connectedUsersTotal: [],
			connectedUsersFiltered: [],
			activeGamesTotal: [],
			activeGamesFiltered: []
		};

		let isServerRunning = false;
		let connectedUsers = new Set<string>();
		let activeGames = new Map<string, string>(); // gameId -> mode

		const userRegex = userRegexStr ? new RegExp(userRegexStr) : null;
		const gameRegex = gameRegexStr ? new RegExp(gameRegexStr) : null;

		entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			const time = entry.timestamp.getTime();

			switch (entry.type) {
				case 'server_start':
					isServerRunning = true;
					data.serverStatus.push({ x: time, y: 1, info: 'Server started' });
					break;
				case 'server_stop':
					isServerRunning = false;
					data.serverStatus.push({ x: time, y: 0, info: 'Server shutting down' });
					// Clear state on stop
					connectedUsers.clear();
					activeGames.clear();
					break;
				case 'connection':
					if (entry.details.user) connectedUsers.add(entry.details.user);
					break;
				case 'disconnection':
					if (entry.details.user) connectedUsers.delete(entry.details.user);
					break;
				case 'game_start':
					// If no explicit ID, use timestamp as unique ID for the graph
					const gameId = entry.details.id !== 'unknown' ? entry.details.id : `game_${time}`;
					activeGames.set(gameId, entry.details.mode);
					break;
				case 'game_stop':
					activeGames.delete(entry.details.id);
					break;
			}

			// If it's the last log and server is still running, close the server status curve
			if (i === entries.length - 1 && isServerRunning) {
				 data.serverStatus.push({ x: time, y: 0, info: 'Presumed shutdown (end of logs)' });
			}

			// Calculate current states for time series
			const totalUsers = connectedUsers.size;
			let filteredUsers = totalUsers;
			
			if (userRegex) {
				filteredUsers = Array.from(connectedUsers).filter(u => userRegex.test(u)).length;
			}

			const totalGames = activeGames.size;
			let filteredGames = totalGames;

			if (gameRegex) {
				filteredGames = Array.from(activeGames.values()).filter(m => gameRegex.test(m)).length;
			}

			// Generate tooltips
			const userListInfo = `Users: ${Array.from(connectedUsers).join(', ')}`;
			const gamesListInfo = `Modes: ${Array.from(activeGames.values()).join(', ')}`;

			// To avoid having points at the exact same millisecond overwriting each other, 
			// you might want to throttle this to 1 point per minute in a heavier production app.
			data.connectedUsersTotal.push({ x: time, y: totalUsers, info: userListInfo });
			data.connectedUsersFiltered.push({ x: time, y: filteredUsers, info: 'Filtered users' });
			
			data.activeGamesTotal.push({ x: time, y: totalGames, info: gamesListInfo });
			data.activeGamesFiltered.push({ x: time, y: filteredGames, info: 'Filtered games' });
		}

		return data;
	}
}
