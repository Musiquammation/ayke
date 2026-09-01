import { IKeyboardController } from "../../../commons/util/controllerInterfaces" 
const KEYS = [
	'up',
	'down',
	'left',
	'right',
	'jump',
	'0',
	'1',
	'2',
	'3',
	'4',
	'5',
	'6',
	'7',
	'8',
	'9',
] as const;

type Key = typeof KEYS[number];

const COMBINAISONS: Record<string, Key> = {
	ArrowLeft: 'left',
	ArrowRight: 'right',
	ArrowUp: 'up',
	ArrowDown: 'down',

	KeyA: 'left',
	KeyD: 'right',
	KeyW: 'up',
	KeyS: 'down',
	Space: 'jump',

	Digit0: '0',
	Digit1: '1',
	Digit2: '2',
	Digit3: '3',
	Digit4: '4',
	Digit5: '5',
	Digit6: '6',
	Digit7: '7',
	Digit8: '8',
	Digit9: '9',
};
class KeyboardController implements IKeyboardController {
	private firstKeys = new Set<Key>();
	private pressedKeys = new Set<Key>();
	private killedKeys = new Set<Key>();

	init() {
		window.addEventListener("keydown", (event) => {
			const key = COMBINAISONS[event.code];

			if (!key)
				return;

			if (!this.pressedKeys.has(key))
				this.firstKeys.add(key);

			this.pressedKeys.add(key);
			this.killedKeys.delete(key);
		});

		window.addEventListener("keyup", (event) => {
			const key = COMBINAISONS[event.code];

			if (!key)
				return;

			this.pressedKeys.delete(key);
			this.killedKeys.add(key);
		});
	}

	first(key: string): boolean {
		return this.firstKeys.has(key as Key);
	}

	press(key: string): boolean {
		return this.pressedKeys.has(key as Key);
	}

	killed(key: string): boolean {
		return this.killedKeys.has(key as Key);
	}

	frame() {
		// first and killed only last for one frame
		this.firstKeys.clear();
		this.killedKeys.clear();
	}
}

export const keyboardController = new KeyboardController();
keyboardController.init();
