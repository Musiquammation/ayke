export interface IKeyboardController {
	first(key: string): boolean;
	press(key: string): boolean;
	killed(key: string): boolean;
}

export interface IMouseController {
	getCoords(): { x: number; y: number };
	first(button: number): boolean;
	press(button: number): boolean;
	killed(button: number): boolean;	
}

export interface IMobileController {
	getDigits(): {x: number, y: number, id: number}[];
	getJoystick(joy: string): {x: number, y: number};
	first(button: number | string): boolean;
	press(button: number | string): boolean;
	killed(button: number | string): boolean;
	showButton(button: string): void;
	hideButton(button: string): void;
}

export interface ILogger {
	debug(text: string): void;
	info(text: string): void;
	warning(text: string): void;
	error(text: string): void;
}