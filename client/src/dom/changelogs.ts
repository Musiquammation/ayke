interface Changelog {
	version: string; // 1.4.0
	date: number; // cooldown
	title: string;
	lines: string[]
}


export const CHANGELOGS: Changelog[] = [
	{
		version: "1.5.4",
		date: 1793804400000, // Wed. 4 nov 2026 at 4:00 PM
		title: "Minor fixes",
		lines: [
			"Jumpies was not implemented",
			"<ust>Rally:</ust> Client was not simulating"
		]
	},
	{
		version: "1.5.3",
		date: 1793797200000, // Wed. 4 nov 2026 at 1:00 PM
		title: "Jumpies, smarter bots and Rally/Castle improvements",
		lines: [
			"<ust>New gamemode:</ust> jumpies, a platformer without platforms: cross the rooms and reach the finish first",
			"<ust>AirBasket:</ust> bots anticipate the ball, pass progressively and no longer leave the arena with it",
			"<ust>Rally:</ust> new level *Chamois*",
			"<ust>Rally:</ust> enemies shown in red, respawn on checkpoints, catch-up blue shell",
			"<ust>Castle:</ust> thwomps only kill from below and stop on the ground",
			"<ust>Castle:</ust> smarter bots that dodge fireballs, rebalanced archers, destroy penalty",
			"<ust>Castle:</ust> seamless background and bigger card highlight",
			"Fix Castle blocks missing on the client in online games",
			"Fix server protocol loading for all gamemods",
		]
	},
	{
		version: "1.5.2",
		date: 1792224000000, // Sat. 17 oct 2026 at 10:00 AM
		title: "Adding Castle and Rally gamemods",
		lines: [
			"<ust>New gamemode:</ust> rally",
			"<ust>New gamemode:</ust> castle",
			"Fix latency problem in few gamemods (using `useDefaultNetworkBehavior`)",
			"*Allow bots* is now a button",
			"Fix coin give",
		]
	},
	{
		version: "1.5.1",
		date: 1790694000000, // Tue. 29 sept 2026 at 5:00 PM
		title: "Friends, Crayzoll, animations and fixes",
		lines: [
			"Add an ending animation to `superTicTacToe`",
			"Improve pushing mechanics in `roarsOnGlass`",
			"Add a friend system",
			"Add back navigation on mobile",
			"Add the new `crayzoll` gamemode, including its game, assets and tutorial",
			"Add visual effects to `airbasket`",
			"Improve `content-card` CSS with appended scrolling",
			"Fix fullscreen finish when a local match ends"
		]
	},
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