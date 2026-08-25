import { Fields } from "../commons/Fields";
import { GameMode } from "../commons/GameMode";

type ActionType = 'all' | 'first' | 'loop' | 'runner';
type Runner<GMode extends GameMode> = (
	(game: GMode) => [Fields[], 'success' | 'failed' | 'pending']
);

interface ActionAll<GMode extends GameMode> {
	type: 'all';
	children: ActionNode<GMode>[];
}

interface ActionFirst<GMode extends GameMode> {
	type: 'first';
	children: ActionNode<GMode>[];
}

interface ActionLoop<GMode extends GameMode> {
	type: 'loop';
	children: ActionNode<GMode>[];
}

interface ActionRunner<GMode extends GameMode> {
	type: 'runner';
	run: Runner<GMode>;
}

type ActionNode<GMode extends GameMode> = (
	ActionAll<GMode> |
	ActionFirst<GMode> |
	ActionLoop<GMode> |
	ActionRunner<GMode>
);


export class Bot<GMode extends GameMode> {
	// Current state of the behavior tree execution
	private currentNode: ActionNode<GMode> | null;
	
	// Stack storing the path of indices to reach the currentNode from the root
	private path: number[] = [];

	constructor(
		private readonly root: ActionNode<GMode>,
		public readonly playerId: number
	) {
		this.currentNode = root;
	}

	/**
	 * Resolves the node corresponding to a given index path from the root.
	 */
	private getNodeAt(path: number[]): ActionNode<GMode> {
		let node: ActionNode<GMode> = this.root;
		for (const idx of path) {
			if ('children' in node) {
				node = (node as any).children[idx];
			}
		}
		return node;
	}

	/**
	 * Removes the current node from the path and returns control to its parent.
	 */
	private returnToParent(currentResult: 'success' | 'failed'): 'success' | 'failed' | 'pending' {
		this.path.pop(); 
		
		if (this.path.length === 0) {
			// Reached the root. Tree execution is fully complete.
			this.currentNode = null;
		} else {
			// The parent node's path is everything up to the last index
			this.currentNode = this.getNodeAt(this.path.slice(0, -1));
		}
		
		return currentResult;
	}

	play(game: GMode): Fields[] {
		const inputs: Fields[] = [];
		let prevResult: 'success' | 'failed' | 'pending' = 'pending';
		
		while (this.currentNode !== null) {
			const node: ActionNode<GMode> = this.currentNode;

			switch (node.type) {
				case 'runner': {
					// Execute leaf node logic
					const [runnerInputs, result] = node.run(game);
					inputs.push(...runnerInputs);

					if (result === 'pending') {
						// Action is pending, pause execution until next frame/tick
						return inputs;
					}

					prevResult = result;
					
					// If the runner is the root node, tree finishes
					if (this.path.length === 0) {
						this.currentNode = null;
						break;
					}
					
					// Yield control to the parent, but we leave the current index
					// in `path` so the parent knows which child just finished.
					this.currentNode = this.getNodeAt(this.path.slice(0, -1));
					break;
				}

				case 'first': { // Selector node
					if (prevResult === 'pending') {
						// First iteration: descend into the first child
						this.path.push(0);
						this.currentNode = node.children[0];
						break;
					}

					if (prevResult === 'failed') {
						let idx = this.path[this.path.length - 1];
						idx++;

						if (idx >= node.children.length) {
							// All children failed, return failure to parent
							prevResult = this.returnToParent('failed');
							break;
						}

						// Try the next child
						this.path[this.path.length - 1] = idx;
						this.currentNode = this.getNodeAt(this.path);
						prevResult = 'pending';
						break;
					}

					// Child succeeded, so 'first' immediately succeeds
					prevResult = this.returnToParent('success');
					break;
				}

				case 'all': { // Sequence node
					if (prevResult === 'pending') {
						// First iteration: descend into the first child
						this.path.push(0);
						this.currentNode = node.children[0];
						break;
					}

					if (prevResult === 'success') {
						let idx = this.path[this.path.length - 1];
						idx++;

						if (idx >= node.children.length) {
							// All children succeeded, return success to parent
							prevResult = this.returnToParent('success');
							break;
						}

						// Execute the next child
						this.path[this.path.length - 1] = idx;
						this.currentNode = this.getNodeAt(this.path);
						prevResult = 'pending';
						break;
					}

					// Child failed, so 'all' immediately fails
					prevResult = this.returnToParent('failed');
					break;
				}

				case 'loop': {
					if (prevResult === 'pending') {
						// First iteration: run the first child
						this.path.push(0);
						this.currentNode = node.children[0];
						break;
					}

					if (prevResult === 'success') {
						// Child succeeded, restart the loop
						prevResult = 'pending';
						this.currentNode = node.children[0];
						break;
					}

					// Child failed, loop terminates and returns success to parent
					prevResult = this.returnToParent('success');
					break;
				}
			}
		}

		return inputs;
	}
}


const bots: Record<string, ActionNode<GameMode>[]> = {};

export function generateBot(
	gamemodeId: string,
	botId: number,
	playerId: number
): Bot<GameMode> {
	const root = bots[gamemodeId];
	if (root === undefined)
		throw new Error(`Cannot find gamemodeId='${gamemodeId}'`);

	if (botId >= root.length)
		throw new Error(`Asked bot #${botId} among ${root.length} bots`);

	return new Bot(root[botId], playerId);
}




export function appendBots<GMode extends GameMode>(
	gamemodeId: string,
	nodes: ActionNode<GMode>[]
) {
	bots[gamemodeId] = nodes as ActionNode<GameMode>[];
}


export function botActionNodeHelper<GMode extends GameMode>() {
	return {
		all(children: ActionNode<GMode>[]): ActionAll<GMode> {
			return {
				type: 'all' as const,
				children
			}
		},

		first(children: ActionNode<GMode>[]): ActionFirst<GMode> {
			return {
				type: 'first' as const,
				children
			}
		},

		loop(children: ActionNode<GMode>[]): ActionLoop<GMode> {
			return {
				type: 'loop' as const,
				children
			}
		},

		runner(run: Runner<GMode>): ActionRunner<GMode> {
			return {
				type: 'runner' as const,
				run
			}
		}
	}
}

