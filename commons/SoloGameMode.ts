import Prando from "prando";
import { IKeyboardController, IMobileController, IMouseController } from "./util/controllerInterfaces";
import { Fields } from "./Fields";

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

	protected abstract run(dt: number, produceFinish: boolean): number | null;

	quickEmulate(duration: number, produceFinish: boolean = false) {
		while (duration > SoloGameMode.MAX_DT) {
			const f = this.run(SoloGameMode.MAX_DT, produceFinish);
			if (f && produceFinish) {return f;}
			duration -= SoloGameMode.MAX_DT;
		}

		return this.run(duration, produceFinish);
	}
}
