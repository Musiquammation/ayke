import { Fields } from "../commons/Fields";
import { GameMode } from "../commons/GameMode";

type ActionType = 'all' | 'first' | 'loop' | 'runner';
type Runner<GMode extends GameMode, Data> = (
	game: GMode,
	data: Data,
	playerIdx: number
) => [Fields[], 'success' | 'failed' | 'pending']

interface ActionAll<GMode extends GameMode, Data> {
	type: 'all';
	children: ActionNode<GMode, Data>[];
}

interface ActionFirst<GMode extends GameMode, Data> {
	type: 'first';
	children: ActionNode<GMode, Data>[];
}

interface ActionLoop<GMode extends GameMode, Data> {
	type: 'loop';
	children: ActionNode<GMode, Data>[];
}

interface ActionRunner<GMode extends GameMode, Data> {
	type: 'runner';
	run: Runner<GMode, Data>;
}

type ActionNode<GMode extends GameMode, Data> = (
	ActionAll<GMode, Data> |
	ActionFirst<GMode, Data> |
	ActionLoop<GMode, Data> |
	ActionRunner<GMode, Data>
);


export class Bot<GMode extends GameMode, Data> {
	// Current state of the behavior tree execution
	private currentNode: ActionNode<GMode, Data> | null;
	
	// Stack storing the path of indices to reach the currentNode from the root
	private path: number[] = [];

	constructor(
		private readonly root: ActionNode<GMode, Data>,
		public readonly playerIdx: number,
		private readonly data: Data
	) {
		this.currentNode = root;
	}

	/**
	 * Resolves the node corresponding to a given index path from the root.
	 */
	private getNodeAt(path: number[]): ActionNode<GMode, Data> {
		let node: ActionNode<GMode, Data> = this.root;
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

		// Restart
		if (this.currentNode === null) {
			this.currentNode = this.root;
		}

		while (this.currentNode !== null) {
			const node: ActionNode<GMode, Data> = this.currentNode;

			switch (node.type) {
				case 'runner': {
					// Execute leaf node logic
					const [runnerInputs, result] = node.run(game, this.data, this.playerIdx);
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
						if (node.children.length === 0) {
							// Empty selector instantly fails
							prevResult = this.returnToParent('failed');
							break;
						}
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
						if (node.children.length === 0) {
							// Empty sequence instantly succeeds
							prevResult = this.returnToParent('success');
							break;
						}
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
						if (node.children.length === 0) {
							// Empty loop terminates and succeeds
							prevResult = this.returnToParent('success');
							break;
						}
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


const bots: Record<string, {
	root: ActionNode<GameMode, any>,
	data: (()=>any)
}[]> = {};

export function generateBot(
	gamemodeId: string,
	botId: number,
	playerId: number,
): Bot<GameMode, any> {
	const root = bots[gamemodeId];
	if (root === undefined)
		throw new Error(`Cannot find gamemodeId='${gamemodeId}'`);

	if (botId >= root.length)
		throw new Error(`Asked bot #${botId} among ${root.length} bots`);

	return new Bot(root[botId].root, playerId, root[botId].data());
}




export function appendBots<GMode extends GameMode>(
	gamemodeId: string,
	nodes: {
		root: ActionNode<GMode, any>,
		data: (()=>any)
	}[]
) {
	bots[gamemodeId] = nodes as {
		root: ActionNode<GameMode, any>,
		data: (()=>any)
	}[];
}


export function botActionNodeHelper<GMode extends GameMode, Data>() {
	return {
		all(children: ActionNode<GMode, Data>[]): ActionAll<GMode, Data> {
			return {
				type: 'all' as const,
				children
			}
		},

		first(children: ActionNode<GMode, Data>[]): ActionFirst<GMode, Data> {
			return {
				type: 'first' as const,
				children
			}
		},

		loop(children: ActionNode<GMode, Data>[]): ActionLoop<GMode, Data> {
			return {
				type: 'loop' as const,
				children
			}
		},

		runner(run: Runner<GMode, Data>): ActionRunner<GMode, Data> {
			return {
				type: 'runner' as const,
				run
			}
		}
	}
}

