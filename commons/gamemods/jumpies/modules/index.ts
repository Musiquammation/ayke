import type { Block } from "../Block";
import { BlockDef } from "../defs";
import { BlockModule } from "./BlockModule";
import { ContinousAttackModule, LavaModule, RepeatedAttackModule } from "./hazards";
import { AccelerationModule, PositionLimiterModule, SpeedModule } from "./movement";
import { HealModule, RestoreJumpModule } from "./pickups";
import { BounceModule, FinishLevelModule, SwitchModule } from "./triggers";

export type { BlockModule };

/** A block needs a speed module as soon as something else can give it a speed. */
function getSpeedDef({ modules, switchStates }: BlockDef) {
	if (modules.speed)
		return modules.speed;

	const switchedSpeed = Object.values(switchStates ?? {}).some(
		state => state.vx !== undefined || state.vy !== undefined
	);

	return (modules.acceleration || switchedSpeed) ? { vx: 0, vy: 0 } : null;
}

/**
 * Creates the modules of a block.
 * The order is the execution order: movements run in a fixed order
 * (acceleration, then speed, then limiter), whatever the order in the level.
 */
export function createModules(def: BlockDef, block: Block): BlockModule[] {
	const list: BlockModule[] = [];
	const m = def.modules;
	const speed = getSpeedDef(def);

	if (m.acceleration) list.push(new AccelerationModule(m.acceleration, block));
	if (speed) list.push(new SpeedModule(speed, block));
	if (m.positionLimiter) list.push(new PositionLimiterModule(m.positionLimiter, block));

	if (m.lava) list.push(new LavaModule());
	if (m.repeatedAttack) list.push(new RepeatedAttackModule(m.repeatedAttack, block));
	if (m.continousAttack) list.push(new ContinousAttackModule(m.continousAttack));
	if (m.heal) list.push(new HealModule(m.heal, block));
	if (m.restoreJump) list.push(new RestoreJumpModule(m.restoreJump, block));
	if (m.bounce) list.push(new BounceModule(m.bounce));
	if (m.switch) list.push(new SwitchModule(m.switch));
	if (m.finishLevel) list.push(new FinishLevelModule());

	return list;
}
