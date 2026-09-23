// types.ts

export interface LogEntry {
	timestamp: Date;
	type: 'server_start' | 'server_stop' | 'connection' | 'disconnection' | 'game_start' | 'game_stop' | 'reward';
	details?: any;
}

export interface ChartDataPoint {
	x: number; // timestamp in milliseconds
	y: number;
	info?: string; // Additional info for tooltip
}

export interface TimeSeriesData {
	serverStatus: ChartDataPoint[];
	connectedUsersTotal: ChartDataPoint[];
	connectedUsersFiltered: ChartDataPoint[];
	activeGamesTotal: ChartDataPoint[];
	activeGamesFiltered: ChartDataPoint[];
}