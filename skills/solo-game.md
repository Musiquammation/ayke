# Skill
L'objectif est de produire un mode de jeu multijoueur (ici nommé example)

Tu dois produire (dans l'ordre):
- GMExample.ts
- example.proto
- example.html
- liste fichiers des assets (images pixel art png) à produire.


Ne mets aucune donnée liée à l'affichage dans Player, etc. ClientData est fait pour ça.






# GMExample.ts

## TEXTURES AVEC DES COULEURS
dans `if (data.firstFrame)`, `imageLoader.setColorRule('textureLabel', 0, {prev: "#ff00ff", color: "#abcdef"})` on choisit la color de sortie (généralement 0 -> #ff0044 et 1 -> #0044ff)
pour l'utiliser, faire `textureLoader.get('textureLabel', 0)` (pour obtenir la texture en bleu par exemple)
S'il n'y a pas de couleurs (ie. la plupart des textures), fais juste `textureLoader.get('textureLabel')`.


## Collect inputs
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


## Mobile
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



## Finish game
Quand le jeu est terminé, on envoit, dans GMExample.run, le score.
Sinon, GMExample.run renvoit null



## Gategories
Les categories sont les différents mode de jeux. 
Par exemple, si un jeu a plusieurs niveau, CATEGORIES vaudra "lvl0", "lvl1", etc.. (ce qui modifiera init).



## Bonnes pratiques
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
Tu dois nécessairement contenir Input, qui doit nécéssairement contenir timestamp.
Je conseille d'utiliser oneof action

```
syntax = "proto3";

package game_testSolo;

message Input {
    double timestamp = 1;
    oneof action {
        float move = 2;
    }
}

```


# example.html
Fichier (utilisant alpine) qui permet de définir category.
x-data=data est produit par generateClientDom.


<div>
    <style>
    </style>

    <div x-data="data">
        <input type="text" x-model="category">
    </div>
</div>



# GMExample.ts
```ts


import Prando from "prando";
import { Fields } from "../Fields";
import { SoloGameMode } from "../SoloGameMode"
import { IKeyboardController, IMouseController, IMobileController } from "../util/controllerInterfaces";
import { ImageLoader } from "../util/ImageLoader";
import { MobileDescriptor } from "../../client/src/controllers/MobileController";


function generateClientDom() {
	return {
		category: "default",

		produce() {
			return this.category;
		}
	};
}

class ClientData {
	
}

export class GMTestSolo extends SoloGameMode {
	static readonly TEXTURES = {};

	static readonly CATEGORIES = ["default"];
	static readonly MIN_FIRST = true;

	static generateClientDom = generateClientDom;
	static create = ()=>new GMTestSolo();

	private player = 500;
	private move = 0;

	init(category: string, rng: Prando, generateClientData: boolean) {
		if (generateClientData) {
			return new ClientData();
		}
	}

	collectInputs(keyboard: IKeyboardController, mouse: IMouseController, mobile: IMobileController | null, data: any) {
		const inputs = [];

		if (keyboard.first('up')) {
			inputs.push({action: 'move', move: -300});
		}

		if (keyboard.first('down')) {
			inputs.push({action: 'move', move: +300});
		}

		if (keyboard.killed('up') || keyboard.killed('down')) {
			inputs.push({action: 'move', move: 0});
		}

		return inputs;
	}

	runInput(input: Fields): void {
		switch (input.action) {
			case 'move':
				break;
		}
	}

	protected run(dt: number, clock: number): number | null {
		this.player += this.move * dt;
		if (this.player <= 0)
			return clock; 

		return null;
	}

	override draw(
		ctx: CanvasRenderingContext2D,
		data: any,
		imageLoader: ImageLoader,
		dt: number
	): void {
        ctx.imageSmoothingEnabled = false;

		ctx.fillStyle = "red";
		ctx.fillRect(0, this.player, 1600, 10);
	}

	getSize(): ({ width: number; height: number; }) {
		return {width: 1600, height: 900};
	}

	evalMouseCoords(x: number, y: number, playerIdx: number, clientData: any): { x: number; y: number; } {
		return {x, y};
	}

	getMobileDesc(): MobileDescriptor {
		
	}
}

```