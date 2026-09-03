# Skill
L'objectif est de produire un mode de jeu multijoueur (ici nommé example)

Tu dois produire (dans l'ordre):
- GMExample.ts
- example.proto
- example.html
- liste fichiers des assets à produire

Toutes les données du jeu doivent être partagées (save, load), car le jeu peut se prendre des load, et donc perdre les données non partagées, engendrant des comportements bizarres.
Ne mets aucune donnée client dans GMExample, Player, etc. ClientData est fait pour ça
En particulier, enregistre Player.connected




# GMExample.ts

## TEXTURES AVEC DES COULEURS
dans `if (data.firstFrame)`, `imageLoader.setColorRule('textureLabel', 0, {prev: "#ff00ff", color: "#abcdef"})` on choisit la color de sortie (généralement 0 -> #ff0044 et 1 -> #0044ff)
pour l'utiliser, faire `textureLoader.get('textureLabel', 0)` (pour obtenir la texture en bleu par exemple)
S'il n'y a pas de couleurs (ie. la plupart des textures), fais juste `textureLoader.get('textureLabel')`.


## COLLECT INPUTS:
`keyboard.first('right')`: 1ère frame à laquelle c'est pressé
`keyboard.press('right')`: en train d'être pressé
`keyboard.killed('right')`: 1ère frame où ça a été laché

`mouse.press(0 1 ou 2)` (avec first et killed aussi)

```ts
export interface IMobileController {
	getDigits(): {x: number, y: number, id: number}[];
	getJoystick(joy: string): {x: number, y: number};
	first(button: number | string): boolean;
	press(button: number | string): boolean;
	killed(button: number | string): boolean;
	showButton(button: string): void;
	hideButton(button: string): void;
}
```

dans `collectInputs`, tu dois rajouter dans inputs:
`{action: 'myAction', myAction: dataOfMyAction}`

Si tu as besoin d'envoyer la souris, alors vérifie que la position à envoyer est différente de l'ancienne (sinon n'envoie rien)

runInput doit modifier l'état du joueur:
- collectInputs ne modifie rien
- runInput modifie l'état du joueur (par exemple, isJumping devient true/false)
- run/frame se lance (par exemple, c'est lui qui se sert de isJumping)


## MOBILE:
```ts
export interface MobileDescriptor {
	joysticks: {
		[key: string]: {
			x: number;
			xp: 'left' | 'right' | 'ratio';
			y: number;
			yp: 'top' | 'bottom' | 'ratio';
			size: number; // in pixels
			color: string;
		};
	};

	buttons: {
		[key: string]: {
			x: number;
			xp: 'left' | 'right' | 'ratio';
			y: number;
			yp: 'top' | 'bottom' | 'ratio';
			size: number; // in pixels
			color: string; // Hex format
		};
	};
}
```



## FINISH GAME:
```ts
export interface FinishGame {
	results: number[][];
	teamEqualities: number[];
	playerEqualities: number[];
}
```

results est un tableau à double entrée d'indexes de joueur.
chaque number[] est une team, dans laquelle les joueurs sont triés du meilleur joueur au pire joueur.
results[0] est la meilleure team, et results[last] la pire
Si results[i] et results[i+1] sont à égalité, alors teamEqualities contient i. teamEqualities doit être trié
Si le joueur i et le joueur i+1 sont à égalité, alors playerEqualities contient i

ex. 
```
results = [
    [3, 0, 1], // team A
    [2, 7, 8], // team B
    [5, 6, 4]  // team C
]
teamEqualities = [1]
playerEqualities = [0, 5, 6]
```

signifie
```
1st: teamA
2nd: teamB
2Nd: teamC (égalité avec teamB)

teamA: [1st=3, 2nd=0, 2nd=1]
teamB: [1st=2, 2nd=7, 2nd=8]
teamC: [1st=5, 1st=6, 1st=4]
```


## LOAD:
Charge les données du protobuf et les met dans le jeu (Player, GMExample)



## BONNES PRATIQUES:
Le temps est float en secondes.
Mets les constantes en haut du fichier.
Commente en anglais toutes les fonctions et utilise des petites méthodes.

```ts
namespace collisions {
    interface Circle {
		x: number;
		y: number;
		r: number;
	}

    // rectangle centré en (x,y)
	interface Rect {
		x: number;
		y: number;
		w: number;
		h: number;
	}

	export function RectCircle(rect: Rect, circle: Circle);
	export function RectRect(a: Rect, b: Rect);
	export function CircleCircle(a: Circle, b: Circle);
}

const norm2 = (dx: number, dy: number) => dx*dx + dy*dy
```


# example.proto
Il s'agit du fichier qui liste les messages protobuf partagés.
State fait référence à GMExample. Tu dois donc y rajouter les players, le timer, redScore, etc.
Concernant les données d'initalisation (genre spawnX, spawnY), elles sont partagées à l'initalisation (StartDataClient) et ne doivent pas être recopiées à chaque save.

```
syntax = "proto3";

package game_example;

message Empty {}


message State {
    // to fill...
}

message QInput {
	double timestamp = 1;
	oneof action {
		Empty right = 2;
		Empty left = 3;
		// etc.
	}
}

message Input {
	QInput data = 1;
	float player = 2;
}

message ServerMessage {
	double timestamp = 1;
	bytes state = 2;
	repeated Input inputs = 3;
}

message ClientMessage {
	double timestamp = 1;
	repeated QInput inputs = 2;
}


message StartData {
	string skin = 1;
	int32 preferTeam = 2;
    // can be completed
}


message StartPlayerInfo {
	float x = 1;
	float y = 2;
	string skin = 3;
	bool isRed = 4;
    // can be completed
}

message StartDataClient {
	repeated StartPlayerInfo players = 1;
}
```





# example.html
Fichier (utilisant alpine) qui permet de définir les données envoyées dans createServ.
x-data=data est produit par generateClientDom.

```html
<div x-data="data">
	<style></style>

	<div>
		<span>Skin:</span>

		<div
			class="skin-select"
			x-data="{ open: false }"
			@click.outside="open = false"
		>
			<button
				type="button"
				class="skin-select-button"
				@click="open = !open"
			>
				<div class="skin-select-current">
					<img
						:src="getIconPath(skin)"
						:alt="SKINS[skin]"
					>
					<span x-text="SKINS[skin]"></span>
				</div>

				<span class="skin-select-arrow" x-text="open ? '▲' : '▼'"></span>
			</button>

			<div
				class="skin-select-options"
				x-show="open"
				x-transition
			>
				<template x-for="(name, id) in SKINS" :key="id">
					<div
						class="skin-select-option"
						:class="{ selected: skin === id, disabled: !hasSkin(id) }"
						@click="skin = id; open = false"
					>
						<img
							:src="getIconPath(id)"
							:alt="name"
						>

						<span x-text="name"></span>
					</div>
				</template>
			</div>
		</div>
	</div>

	<div>
		<span>Preferred team:</span>
		<button type="button"
				@pointerup="preferTeam = 0"
				:class="{ selected: preferTeam === 0 }">
			None
		</button>

		<button type="button"
				@pointerup="preferTeam = 1"
				:class="{ selected: preferTeam === 1 }">
			Red
		</button>

		<button type="button"
				@pointerup="preferTeam = -1"
				:class="{ selected: preferTeam === -1 }">
			Blue
		</button>
	</div>
</div>
```


# Modèle pour example.ts
```ts
import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";
import { norm2 } from "../util/norm2";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader } from "../util/ImageLoader";

const protocols = getProtocol('example', 'multiplayer');

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

const GRAVITY = 1100;
const WIDTH = 2400;
const HEIGHT = 1350;
const RESPAWN_COOLDOWN = 2; // 2 seconds
const PLAYER_SIZE = 50; // 2 seconds

const X_LIMIT = WIDTH * 2.5;
const Y_LIMIT = HEIGHT * 1.5;


class Player {
	spawnX: number | null = null;
	spawnY: number | null = null
	connected = true;
	alive = -1;
	team: 'red' | 'blue' = 'red';

	constructor(
		public x: number,
		public y: number
	) {
	}

	initSpawn(x: number, y: number, team: 'red' | 'blue') {
		this.spawnX = x;
		this.spawnY = y;
		this.x = x;
		this.y = y;
		this.team = team;
	}

	isAlive() {
		return this.alive < 0;
	}

	move(dt: number, grabber: boolean) {
		if (this.alive >= 0) {
			this.alive -= dt;
			if (this.alive >= 0)
				return;

			if (this.spawnX !== null) {this.x = this.spawnX;}
			if (this.spawnY !== null) {this.y = this.spawnY;}
		}

		if (this.isOOB()) {
			this.die();
		}
	}

	
	load(obj: Fields) {
		this.x = obj.x;
		this.y = obj.y;
		/// complete
	}

	isOOB() {
		return (
			this.x < -X_LIMIT + PLAYER_SIZE/2 ||
			this.x > X_LIMIT - PLAYER_SIZE/2 ||
			this.y < -Y_LIMIT + PLAYER_SIZE/2 ||
			this.y > Y_LIMIT - PLAYER_SIZE/2
		);
	}

	die() {
		this.alive = RESPAWN_COOLDOWN;
	}
}




class Camera {
	x = 0;
	y = 0;

	static readonly SCALE = 0.8;

	/**
	 * Calculates the center coordinates of the zone the player is currently in.
	 */
	private getZoneCenter(px: number, py: number) {
		// Calculate the zone index based on the player's position
		// Since zone starts at x*W - W/2, the center is exactly at x*W
		let zx = Math.round(px / WIDTH);
		let zy = Math.round(py / HEIGHT);

		// Clamp indices to your specific bounds: x in [-2, 2] and y in [-1, 1]
		zx = Math.max(-2, Math.min(2, zx));
		zy = Math.max(-1, Math.min(1, zy));

		return {
			cx: zx * WIDTH,
			cy: zy * HEIGHT
		};
	}

	/**
	 * Updates the camera position.
	 * @param px Player X position
	 * @param py Player Y position
	 * @param dt Delta time (time elapsed since last frame, e.g., in milliseconds)
	 */
	update(px: number, py: number, dt: number) {
		this.x = px;
		this.y = py;
	}

	/**
	 * Instantly moves the camera to the player's current zone, 
	 * breaking any ongoing transition.
	 */
	teleport(px: number, py: number) {
		const { cx, cy } = this.getZoneCenter(px, py);
		
		// Instantly snap coordinates
		this.x = cx;
		this.y = cy;
	}

	getCoords() {
		return { x: this.x, y: this.y };
	}
}

class ClientData {
	firstFrame = true;
	mouseX = 0;
	mouseY = 0;
	skins: string[] = [];

	readonly html: HTMLDivElement;

	readonly time: HTMLDivElement;
	
	readonly redScore: HTMLDivElement;
	readonly blueScore: HTMLDivElement;

	readonly camera = new Camera();

	private clientWasDead = true;

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-example-client-data");

		this.time = document.createElement("div");
		this.time.classList.add("game-example-time");

		const scores = document.createElement("div");
		scores.classList.add("game-example-scores");
		this.redScore = document.createElement("div"),
		this.blueScore = document.createElement("div"),

		this.redScore.classList.add("game-example-red-score");
		this.blueScore.classList.add("game-example-blue-score");

		const tiret = document.createElement("div");
		tiret.textContent = "-";

		scores.appendChild(this.redScore);
		scores.appendChild(tiret);
		scores.appendChild(this.blueScore);
		
		this.html.appendChild(scores);
		this.html.appendChild(this.time);
	}

	static readonly PERIODS = ["normal", "grabber infinite", "sudden death"];

	static showTime(time: number) {
		const minutes = Math.floor(time / 60);
		const seconds = (time % 60).toFixed(1);

		return `${minutes}:${seconds.padStart(4, "0")}`;
	}

	update(game: GMExample, playerIdx: number) {
		this.time.innerText = 
			ClientData.showTime(game.time);

		this.redScore.innerText =
			String(game.redScore).padStart(2, "0");

		this.blueScore.innerText =
			String(game.blueScore).padStart(2, "0");

		// Player
		const player = game.players[playerIdx];
		if (this.clientWasDead && player.alive < 0) {
			this.camera.teleport(player.x, player.y)
		}
		this.clientWasDead = (player.alive >= 0);

		this.camera.update(player.x, player.y, 1/60);
	}
}


class TutorialData {
	private step = 0;

	constructor(private readonly game: GMExample) {}

	frame(dt: number, clock: number) {
		const player = this.game.players[0];
		const bot = this.game.players[1];

		if (player.alive >= 0)
			this.step = 0; // restart

		if (this.step === 0) {
			return "Hello World";
		}

		return ""; // no text to show
	}
}



function generateClientDom(unlockedSkins: string[]) {
	return {
		skin: Object.keys(GMExample.SKINS)[0],
		preferTeam: 0,
		SKINS: GMExample.SKINS,
		unlockedSkins: unlockedSkins,

		produce() {
			const {StartData} = protocols.get();
			return StartData.encode({
				skin: this.skin,
				preferTeam: this.preferTeam
			}).finish();
		},

		hasSkin(skin: string) {
			return this.unlockedSkins.includes(skin);
		},

		getSkinIconPath
	};
}


function getSkinTexturePath(id: string) {
	return `/assets/games/test/skins/${id}/grid.png`
}

function getSkinIconPath(id: string) {
	return `/assets/games/test/skins/${id}/icon.png`
}


export class GMExample extends GameMode {
	static readonly types = {Player};

	static readonly DATA = {
		GRAVITY,
		WIDTH,
		HEIGHT,
		X_LIMIT,
		Y_LIMIT
	};

	readonly players: Player[];
	redScore = 0;
	blueScore = 0;

	time = 300;

	internalFrameTick = 0;

	private constructor(total: number) {
		super();

		this.players = Array.from(
			{ length: total },
			() => new Player(0, 0)
		);
	}

	static async createServ(
		players: PlayerInput[],
		total: number,
		hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	) {
		const {StartData, StartDataClient} = protocols.get();

		const game = new GMExample(total);


		function decode(i: number) {
			if (i < players.length)
				return decodeFullMessage(StartData.decode(players[i].data));

			return generateClientDom([]);
		}


		// Pre-decode all player messages once for performance
		const playerInfos = await Promise.all(
			game.players.map(async (p, i) => {
				const d = decode(i);
				let skin: string;
				const pseudo = i < players.length ? players[i].pseudo : null;
				if (pseudo !== null && GMExample.SKINS_IDS.includes(d.skin)) {
					if (await hasSkin('example', d.skin, pseudo)) {
						skin = d.skin as string;
					} else {
						skin = GMExample.SKINS_IDS[0];
					}
				} else {
					skin = GMExample.SKINS_IDS[0];
				}

				return {
					player: p,
					index: i,
					skin: skin,
					pref: d.preferTeam ?? 0
				}
			})
		);

		const totalPlayers = playerInfos.length;
		const maxPerTeam = Math.ceil(totalPlayers / 2);

		const assigned = new Array(totalPlayers);
		let redCount = 0;
		let blueCount = 0;

		// Phase 1: Assign players with explicit valid preferences if team capacity allows
		for (let i = 0; i < totalPlayers; i++) {
			const info = playerInfos[i];
			if (info.pref === 1 && redCount < maxPerTeam) {
				assigned[info.index] = true; // Red
				redCount++;
			} else if (info.pref === -1 && blueCount < maxPerTeam) {
				assigned[info.index] = false; // Blue
				blueCount++;
			}
		}

		// Phase 2: Fill remaining slots by alternating to maintain balanced team sizes
		for (let i = 0; i < totalPlayers; i++) {
			if (assigned[i] !== undefined) continue;

			// Assign to the team that currently has fewer players
			const isRed = redCount < blueCount || (redCount === blueCount && i % 2 === 0);
			if (isRed && redCount < maxPerTeam) {
				assigned[i] = true;
				redCount++;
			} else {
				assigned[i] = false;
				blueCount++;
			}
		}

		// Phase 3: Initialize spawn points based on final team assignments
		for (const [i, p] of game.players.entries()) {
			const redTeam = assigned[i];
			p.initSpawn(
				redTeam ? -WIDTH * 2 : WIDTH * 2,
				0,
				redTeam ? 'red' : 'blue'
			);
		}



		const data = StartDataClient.encode({
			players: game.players.map((p, idx) => ({
				x: p.spawnX,
				y: p.spawnY,
				skin: playerInfos[idx].skin,
				isRed: p.team === 'red'
			}))
		}).finish();

		return {
			game,
			data
		}
	}

	static createClient(
		data: Uint8Array | null,
		total: number
	) {
		const game = new GMExample(total);
		const {StartDataClient} = protocols.get();
		const clientData = new ClientData();
		let skins: { [k: string]: string; };

		if (data) {
			const {players} = decodeFullMessage(StartDataClient.decode(data));
	
			const skinSet = new Set<string>();
			for (const [idx, p] of players.entries()) {
				game.players[idx].initSpawn(p.x, p.y, p.isRed ? 'red' : 'blue');
				clientData.skins.push(p.skin);
				skinSet.add(p.skin);
			}
			console.log(skinSet);
			skins = Object.fromEntries(
				[...skinSet].map(key => ['skin-' + key, getSkinTexturePath(key)])
			);

		} else {
			game.players[0].initSpawn(-WIDTH * 2, 0, 'red');
			game.players[1].initSpawn(+WIDTH * 2, 0, 'blue');
			clientData.skins = Array.from(
				{length: game.players.length},
				()=>GMExample.SKINS_IDS[0]
			);

			skins = {};
		}


		return {
			game,
			data: clientData,
			html: clientData.html,
			skins
		};
	}

	static readonly generateClientDom = generateClientDom;

	static readonly SKINS = {
		'default': "Default",
	};
	static readonly SKINS_IDS = Object.keys(GMExample.SKINS);

	static readonly TEXTURES = {
		'example': "/assets/games/test/example.png",
		'skin-default': getSkinTexturePath('default')
	};


	override init(): void {
		
	}

	override getBotIds(count: number): number[] {
		return Array.from(
			{ length: count },
			() => 0
		);
	}


	override run(dt: number, produceFinish: boolean): FinishGame | null {
		// Time
		this.time -= dt;
        let finished = false;
		if (this.time <= 0) {
			finished = true;
            this.time = 0;
		}


		if (produceFinish && finished) {
			return this.produceFinish();
		}

		return null;
	}

	override runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];
		switch (input.action) {
			case 'right':
				break;

			case 'left':
				break;

			
		}
	}

	override collectInputs(
		keyboard: IKeyboardController,
		mouse: IMouseController,
		mobile: IMobileController | null,
		_data: any
	) {
		const data = _data as ClientData;
		const throwTarget = mouse.getCoords();
		data.mouseX = throwTarget.x;
		data.mouseY = throwTarget.y;


		// Left / Right
		const inputs: Fields[] = [];

		return inputs;
	}




	private drawMinimap(
		ctx: CanvasRenderingContext2D,
		playerIdx: number
	) {
		
	}

	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		_imageLoader: ImageLoader
	) {
        ctx.imageSmoothingEnabled = false;
        
		const imageLoader = _imageLoader.getFolder('example');

		const data = _data as ClientData;
		if (data.firstFrame) {
			data.firstFrame = false;
		}


		data.update(this, playerIdx);

		ctx.fillStyle = "#333";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);

		// Center the camera on the current player
		const cameraCoords = data.camera.getCoords();
		ctx.save();
		ctx.translate(WIDTH / 2, HEIGHT / 2);
		ctx.scale(Camera.SCALE, Camera.SCALE);
		ctx.translate(-cameraCoords.x, -cameraCoords.y);

		

		ctx.restore();

		this.drawMinimap(ctx, playerIdx);
	}


	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	override save(): Uint8Array {
		const {State} = protocols.get();
		const object: Fields = {
		};
		
		return State.encode(object).finish();
	}

	override load(data: Uint8Array) {
		const {State} = protocols.get();
		const obj = State.decode(data);
		
	}

	override getSize() {
		return {width: WIDTH, height: HEIGHT};
	}

	override evalMouseCoords(
		x: number,
		y: number,
		playerIdx: number,
		_clientData: any
	) {
		const clientData = _clientData as ClientData;
		const cameraCoords = clientData.camera.getCoords();

		const ret = {
			x: (x - WIDTH / 2) / Camera.SCALE + cameraCoords.x,
			y: (y - HEIGHT / 2) / Camera.SCALE + cameraCoords.y
		};

		clientData.mouseX = ret.x;
		clientData.mouseY = ret.y;

		return ret;
	}

	override getMobileDesc(): MobileDescriptor {
		return {
            joysticks: {

            },

            buttons: {

            }
        };
	}



	override createTutorial() {
		return new TutorialData(this);
	}

	private produceFinish(): FinishGame {
		
	}
}


```