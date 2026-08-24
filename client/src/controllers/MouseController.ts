import { IMouseController } from "../../../commons/GameMode";

class MouseController implements IMouseController {
	init() {
		
	}

	getX(): number {
		throw new Error("Method not implemented.");
	}
	getY(): number {
		throw new Error("Method not implemented.");
	}
	first(button: number): boolean {
		throw new Error("Method not implemented.");
	}
	press(button: number): boolean {
		throw new Error("Method not implemented.");
	}
	killed(button: number): boolean {
		throw new Error("Method not implemented.");
	}
}


export const mouseController = new MouseController();
mouseController.init();
