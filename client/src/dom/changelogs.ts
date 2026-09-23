interface Changelog {
	version: string; // 1.4.0
	date: number; // cooldown
	title: string;
	lines: string[]
}


export const CHANGELOGS: Changelog[] = [
	{
		version: "1.5.0",
		date: 1790175600000, // Wed. 23 sept 2026 at 5:00 PM
		title: "Graphic improvements",
		lines: [
			"Encourage players to create an account 24 hours after their last connection, if they are not logged in",
			"Rework the `#home-page` layout and styling",
			"Add a contact page",
			"Rework the `#game-panel-page` layout and styling",
			"Add gamemode descriptions",
			"Improve graphics and collision handling in `roarsOnGlass`",
			"Switch to the \"Rye\" font",
			"Display the total number of connected users",
			"Add transitions during loading screens",
			"Add gamemode explanation screens",
			"Add specific explanation screens for `airbasket` and `superTicTacToe`",
			"Display \"You\" above your own player in `airbasket` and `roarsOnGlass`",
			"Add a game-end animation",
			"Fix and improve *Alpine.js* issues",
			"Add server logs for connections and matching user lists",
			"Improve `lavaBall`"
		]
	},
	{
		version: "1.4.1",
		date: 1789650000000, // Thu. 17 sept 2026 at 2:00 PM
		title: "Improve UI and bots",
		lines: [
			"Hide *play* button when client offline and rework `game-panel-page`",
			"Remove `endTurn` btn for mobile users *(it was not used)*",
			"Improve roarsOnGlass bots"
		]
	},
	{
		version: "1.4.0",
		date: 1789552800000, // Wed. 16 sept 2026 at 12h
		title: "Add gamemods and improve ayke",
		lines: [
			"<ust>Tutorial / vs Bots:</ust> skin & team selection",
			"<ust>Controls:</ust> improve joystick",
			"<ust>RoarsOnGlass:</ust> fix `dirX` / `dirY`",
			"<ust>WoodSword:</ust> show opponent sword; balance streams; add bot",
			"<ust>AirBasket:</ust> smarter bots; SPACE to target bucket area",
			"<ust>Rooms:</ust> show connected users per gamemode/total; destroy empty rooms",
			"<ust>RoarsOnGlass:</ust> bright player outline",
			"<ust>Leaderboard:</ust> only suggest multiplayer gamemodes",
			"<ust>UI:</ust> show ping; blur icons",
			"<ust>Turrets:</ust> add icon",
			"<ust>New games:</ust> Popit, LavaBall, MoveArmy*(still bugged)*",
			"Versioned changelogs;",
		]
	},

	{
		version: "1.3.0",
		date: 1789120800000, // Fri. 11 sept 2026 at 12h
		title: "Trophee road",
		lines: [
			"Trophee road",
			"Collectibles, coins",
			"Improve `game-result` page",
			"RNG API (applied to *woodSword*)",

		]
	}   
];


// (1+Math.floor(Date.now()/3600000))*3600000