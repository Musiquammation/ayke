import Prando from "prando";
import { IKeyboardController, IMobileController, IMouseController } from "./util/controllerInterfaces";
import { Fields } from "./Fields";
import { ImageLoader } from "./util/ImageLoader";
import { MobileDescriptor } from "../client/src/controllers/MobileController";

export abstract class SoloGameMode {
	public static readonly MAX_DT = 0.020; // 20ms

	abstract init(
		category: string,
		rng: Prando,
		generateClientData: boolean
	): any;
	
	abstract collectInputs(
		keyboard: IKeyboardController,
		mouse: IMouseController,
		mobile: IMobileController | null,
		data: any
	): Fields[];

	abstract runInput(playerIdx: number, input: Fields): void;

	protected abstract run(dt: number): number | null;

	abstract draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		data: any,
		imageLoader: ImageLoader,
		dt: number
	): void;

	quickEmulate(duration: number) {
		while (duration > SoloGameMode.MAX_DT) {
			const f = this.run(SoloGameMode.MAX_DT);
			if (f) {return f;}
			duration -= SoloGameMode.MAX_DT;
		}

		return this.run(duration);
	}

	abstract getSize(): ({width: number, height: number});
	
	abstract evalMouseCoords(
		x: number,
		y: number,
		playerIdx: number,
		clientData: any
	): {x: number, y: number};

	abstract getMobileDesc(): MobileDescriptor | null;
}
