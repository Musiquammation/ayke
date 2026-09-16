# GMMoveArmy

id: moveArmy

Do not write examples. Write `GMMoveArmy` or `moveArmy`.

The game is 2v2. Players on the same team are always allied.

Create an abstract `Troop` class.

Each troop belongs to either the red team or the blue team.

Create the following troop types:

* `TSoldier`
* `TArcher`
* `TTank`
* `TBomber`
* `TCar`

`TArcher` can shoot arrows within a certain range.

`TSoldier` deals damage to nearby troops.

`TBomber` throws bombs within a certain range. Bombs deal area-of-effect damage.

`TTank` has a lot of health and deals little damage.

`TCar` moves very quickly and shoots arrows like `TArcher`. It can continue moving while attacking.

All troops except `TCar` become immobile while attacking.

## Arena

The arena is a portrait-oriented rectangle.

The red team starts at the top, with negative coordinates.

The blue team starts at the bottom, with positive coordinates.

Place 3 turrets for each team.

Turrets shoot arrows rapidly and deal a lot of damage.

## Zones

The arena is divided into 5 zones.

* `y--`: red slow zone
* `y0`: normal zone
* `y++`: blue slow zone

The slow zones slow down any troops standing inside them, regardless of their team.

Troops spawn at the extreme top/bottom edges depending on their team, inside their respective slow zone.

The x-coordinate of a troop is fixed depending on its type.

## Spawn mana

When a troop dies, add `0.7` units to the mana gauge of that troop type. Create a constant for this value.

The mana gauges are not displayed on the client.

When a gauge exceeds `1`, subtract `1` from it and spawn one troop of that type.

Each mana gauge also increases every frame by a constant amount, for example `0.3` per second. Create a constant for this value.

Initial spawn mana values:

* `TSoldier.SPAWN_MANA = 12`
* `TArcher.SPAWN_MANA = 7`
* `TTank.SPAWN_MANA = 3`
* `TBomber.SPAWN_MANA = 4`
* `TCar.SPAWN_MANA = 3`

## Troop behaviour

Each troop has a unique ID.

Each troop has a `neighboor` that it wants to move toward.

The `neighboor` can be:

* a point `(x, y)`
* a turret
* the ID of an allied troop
* the ID of an enemy troop

The troop moves toward its current target.

If its target is an allied troop and that allied troop starts attacking, stop targeting that allied troop and choose another target instead.

If a troop has no target for more than one second, create a constant for this duration, it attaches itself to the closest allied troop, except for the previous troop it was attached to.

If it still has not found a target after another second, it moves forward according to its team.

When attaching to a neighbour, make sure that the resulting graph is not cyclic.

More specifically, check whether following the neighbour links can eventually lead back to the current troop. If so, simply ignore that troop and search for another valid one.

## Slow zones

Inside a slow zone, troops only move forward according to their team.

They still form their neighbour graphs while doing so.

## Neighbour links

Neighbour links are rendered as thin arrows using the colour of the corresponding team.

## Cutting links

On the client, the player can start a mouse or touch input and drag it to form a line.

This line cuts every displayed neighbour link that it intersects, thereby removing those links.

The client sends:

`start(x, y)` and `end(x, y)`.

The affected arrows should become thicker while they are being targeted by the cutting line.

## Creating links

If the player starts the input by touching a troop, they are no longer in cutting mode.

They enter neighbour-link mode, allowing them to create a new link.

The player can hold the mouse/finger and move it toward:

* a selected point `(x, y)`
* another troop
* a turret
* the same troop, to cancel

This sends a `changeNeighboor` action.

A player can only change the `neighboor` of a troop belonging to their own team.

## Objective and game duration

The objective is to capture the opponent's turrets.

A game lasts 3 minutes, followed by 1 minute of sudden death.

Display the HP of every turret.

Do not display a troop's HP unless it has taken damage. In that case, display its health bar.

## Troop highlighting

When the mouse is near a troop, or when a troop is selected, for example to change its target, draw a highlight around that troop.

## Projectiles

Arrows and bombs must be both rendered and transmitted through the game protocol.

Implement the necessary projectile entities and their synchronization between server and clients.

## Collisions

Implement troop collisions by adapting the following collision code to the new troop hitboxes and dimensions:

```ts
private handlePlayerCollisions(): void {
	const halfSize = PLAYER_SIZE / 2;
	const round = PLAYER_ROUND;

	for (let i = 0; i < this.players.length; i++) {
		const a = this.players[i];
		if (!a.isAlive()) continue;

		for (let j = i + 1; j < this.players.length; j++) {
			const b = this.players[j];
			if (!b.isAlive()) continue;

			const dx = b.x - a.x;
			const dy = b.y - a.y;

			// The two rounded rectangles are separated.
			const maxDistance = PLAYER_SIZE;

			if (Math.abs(dx) >= maxDistance || Math.abs(dy) >= maxDistance)
				continue;

			// Center of A's hitbox toward B.
			const ax = Math.abs(dx);
			const ay = Math.abs(dy);

			// Distance between the straight sections of the two hitboxes.
			const px = Math.max(0, ax - (PLAYER_SIZE - round * 2));
			const py = Math.max(0, ay - (PLAYER_SIZE - round * 2));

			const dist2 = px * px + py * py;
			const radius = round * 2;

			if (dist2 >= radius * radius)
				continue;

			let nx: number;
			let ny: number;
			let penetration: number;

			if (dist2 === 0) {
				// Collision inside the rectangular sections.
				if (ax > ay) {
					nx = Math.sign(dx) || 1;
					ny = 0;
					penetration = PLAYER_SIZE - ax;
				} else {
					nx = 0;
					ny = Math.sign(dy) || 1;
					penetration = PLAYER_SIZE - ay;
				}
			} else {
				const dist = Math.sqrt(dist2);

				nx = dx / dist;
				ny = dy / dist;

				penetration = radius - dist;
			}

			const correction = penetration / 2;

			a.x -= nx * correction;
			a.y -= ny * correction;

			b.x += nx * correction;
			b.y += ny * correction;
		}
	}
}
```

## Comments

Write verbose comments in English throughout the implementation.

The implementation should cover the complete server-side game logic, client-side rendering, troop behaviour, neighbour graph management, input handling, projectiles, collisions, turret capture, health bars, highlighting, and synchronization required by the above specification.
