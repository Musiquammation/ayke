# Turrets — Complete Semantic Game Mechanics Reference

> Source: server-authoritative TypeScript implementation (`turrets.ts`), simulated at a fixed tick with per-frame `dt` (seconds). All rules below are **objective rules derived directly from the source code** unless explicitly labeled **[INFERRED]** (a strategic interpretation derived from combining several rules) or **[UNKNOWN]** (behavior/purpose that cannot be determined from the available code).
>
> Game type: 2-team (`red` vs `blue`) real-time team-objective arena shooter. Teams fight over control of 25 stationary **turrets** spread across a 5×5 grid of rooms. The team controlling more turrets when the match ends wins.

---

## 1. World / Map

### 1.1 Coordinate system and scale
- World is a continuous 2D plane, no gravity/verticality is used in simulation (a `GRAVITY = 1100` constant exists but is **[UNKNOWN]** — no code path in the provided file references it; treat as unused/legacy).
- Base screen size: `WIDTH = 2400`, `HEIGHT = 1350` (used for camera/HUD layout, not world size).
- `FULL_ROOM_SIZE = WIDTH * 2.5 = 6000` — the center-to-center spacing between adjacent rooms in the grid.
- `ROOM_SIZE = WIDTH * 1.5 = 3600` — the side length of each room's walkable square floor.
- `BRIDGE_SIZE = WIDTH * 0.3 = 720` — the width of the corridor connecting two adjacent rooms.
- Hard outer bound for players: `±(FULL_ROOM_SIZE * 3) = ±18000`, inset by `Player.RADIUS = 60` (`avoidOOB`).
- Hard outer bound for bullets/entities (despawn boundary): `Math.abs(x or y) > FULL_ROOM_SIZE * 3 = 18000`.

### 1.2 Room grid
- Rooms exist at every `(x, y)` with `x, y ∈ {-2, -1, 0, 1, 2}`, at world position `(x * FULL_ROOM_SIZE, y * FULL_ROOM_SIZE)` → 25 rooms total, forming a 5×5 grid spanning world coordinates from `(-12000,-12000)` to `(12000,12000)`.
- Each room's floor is a square: `x ∈ [center.x - ROOM_SIZE/2, center.x + ROOM_SIZE/2]`, same for `y` (half-extent 1800 from center).
- **Bridges**: a horizontal bridge connects room `(x,y)` to `(x+1,y)` for every `x < 2`; a vertical bridge connects `(x,y)` to `(x,y+1)` for every `y < 2`. Bridges are `BRIDGE_SIZE = 720` wide and span the gap between the two rooms' floor edges. **There are no diagonal bridges.** Traveling between diagonally-adjacent rooms (e.g., `(-2,-2)` → `(-1,-1)`) requires passing through an intermediate room.
- **Rule**: a player who is not inside any floor/bridge rectangle is smoothly clamped (`avoidOutOfFloor`) to the closest point on the nearest floor rectangle every frame — this functions as an invisible wall preventing players from leaving the walkable room/bridge network. **Bullets, thrown items, and spawned entities (sliders, walls, balloons, tanks, boosters, stars, traps) are NOT constrained by floors** — they travel in straight lines across empty space between rooms unaffected by the floor layout.

### 1.3 Player spawn points
- Fixed, unchanging for the whole match, independent of turret capture progress:
  - Red team spawn: `(0, -FULL_ROOM_SIZE * 2) = (0, -12000)` — the exact position of the middle turret in the top row (a permanently red-starting row).
  - Blue team spawn: `(0, FULL_ROOM_SIZE * 2) = (0, 12000)` — the exact position of the middle turret in the bottom row.
- **Constraint**: death always respawns the player at this fixed home point, never at a forward base or nearest owned turret, regardless of how the front line has shifted.

---

## 2. Turrets

25 `Turret` objects exist, one per room, at the room's center coordinates. Turrets are the sole win-condition resource.

### 2.1 Turret state
| Field | Meaning |
|---|---|
| `team` | `'red'`, `'blue'`, or `null` (neutral/uncaptured) |
| `activation` | Running scalar tug-of-war score while `team === null`. Range effectively unbounded until ±`TURRET_ACTIVATION` |
| `hp` | Current HP while captured (`team !== null`). Max `TURRET_HP = 1200` |
| `itemDamage` | Accumulated same-team ("friendly") damage once `hp` is already at max, toward the item-farming threshold |
| `itemLoadingTimer` / `fullLoadingTimer` | Countdown / total duration of the current item-production pause |
| `startCooldown` | Post-capture grace period before the turret can fire (`TURRET_START_COOLDOWN = 5.0s`) |
| `attackCooldown` | Countdown between attack pulses (`TURRET_COOLDOWN = 2.0s` base) |
| `itemsToSpawn`, `spawnIdx` | Pending item drops and the angular position counter used to place them |
| `attackSpeedMultiplier` | Per-frame buff value (reset to 1 every frame, re-applied by an attached `EBooster`) |

### 2.2 Initial ownership layout
`SPAWN_COLORS` (row index = `y+2`, column index = `x+2`, for `x,y ∈ {-2..2}`):

| Row (y) | x=-2 | x=-1 | x=0 | x=1 | x=2 |
|---|---|---|---|---|---|
| y=-2 | red | red | red | red | red |
| y=-1 | red | — | — | — | red |
| y=0 | — | — | — | — | — |
| y=1 | blue | — | — | — | blue |
| y=2 | blue | blue | blue | blue | blue |

- Result: **7 turrets start red-owned, 7 start blue-owned, 11 start neutral** (25 total).
- Red's home row (y=-2, all red) sits at the red spawn point's row; blue's home row (y=2) sits at blue spawn's row. The middle row (y=0) is entirely neutral, forming a contested "front line" band; rows y=-1/y=1 have contested middles flanked by pre-owned corners.

### 2.3 Turret physical size vs. functional radii (three distinct radii — do not conflate)
| Radius | Value | Purpose |
|---|---|---|
| `Turret.SIZE` (via `getRadius()`) | 100 | Physical hit-circle used for bullet collision (`Bullet.RADIUS(10) + 100`) |
| `TURRET_RADIUS` | `WIDTH * 0.6 = 1440` | (a) Max travel distance of the turret's own attack bullets; (b) distance from turret center at which items are spawned when produced |
| `ROOM_SIZE` (half-extent 1800) | 3600 (box side) | Bounding box used to detect enemy presence and decide whether to fire at all |

**[INFERRED]** Because the enemy-detection box (half-extent 1800, i.e. the room's own floor square) is larger than the turret's actual bullet range (1440), there exist safe pockets — particularly the four corners of a room's square floor (distance ≈2546 from center) — where a player is *inside the detection zone* (so their presence still triggers the turret to fire and reset its cooldown) but *outside the lethal radius* (so they take no damage from that pulse). This allows baiting a turret's cooldown from a safe position.

### 2.4 Turret capture — neutral turret (`team === null`)
**Rule**: only **player-fired bullets** and **`ETank` contact-death** can register hits against a turret at all (see §4.9, §9.5 — turret-fired bullets and AoE item explosions on neutral turrets are excluded).

On a qualifying hit of `damage` by `attackerTeam`:
```
if attackerTeam == 'red':  activation += damage
else:                      activation -= damage
if activation >= TURRET_ACTIVATION (2000):  capture('red')
elif activation <= -TURRET_ACTIVATION (-2000): capture('blue')
```
- **Constraint**: this is a single shared scalar — damage from the two teams on the same neutral turret cancels out (a tug-of-war), so a neutral turret contested simultaneously by both sides makes little or no net progress toward capture until one side clearly dominates the exchange.
- Neutral turrets never take net HP loss and are never "destroyed" — they simply flip ownership once the threshold is reached.

### 2.5 Turret capture — captured turret (`team ≠ null`)
On a qualifying hit of `damage` by `attackerTeam`:

**Same team as turret (friendly fire):**
```
if hp < TURRET_HP (1200):
    hp = min(TURRET_HP, hp + damage)      # friendly fire HEALS the turret
else:
    itemDamage += damage
    if itemDamage >= TURRET_ITEM_DAMAGES (500):
        fullLoadingTimer = -1             # flags a reload-timer recompute next frame
        itemDamage = 0
        hp -= damage                       # the *triggering* shot also costs real HP
```
**Different team (enemy fire):**
```
hp -= damage
itemDamage = 0                             # any farming progress is wiped by enemy damage
if hp <= 0:
    capture(attackerTeam)
```
**Key rules**:
- Friendly fire never reduces HP *except* for the exact shot that crosses the 500-itemDamage threshold, which both grants the item drop **and** subtracts that shot's damage from HP even though it came from the same team.
- Any enemy damage landing on a captured turret resets `itemDamage` to 0, meaning a team's item-farming progress cannot be "banked" across interruptions from enemy fire — it must accumulate to 500 without an enemy hit landing in between.

### 2.6 `capture(newTeam)` — full state reset
```
prevCapture = old team (or true if it was previously null)
team = newTeam
hp = TURRET_HP (1200)          # full heal
activation = 0
itemDamage = 0
itemLoadingTimer = 0            # NOT paused — can act immediately once startCooldown elapses
startCooldown = TURRET_START_COOLDOWN (5.0s)
attackCooldown = 0
itemsToSpawn = 0                 # any pending item drop is cancelled
spawnIdx = 2 if newTeam == 'red' else 6   # different starting angle per team
```
- **Effect**: capturing a turret (either from neutral, or flipping it from the enemy) always gives you a fresh, full-HP turret, but it is defenseless for `TURRET_START_COOLDOWN = 5.0s` immediately after capture (see §2.8). This is a genuine window of vulnerability for a retaliatory recapture.

### 2.7 Turret item production ("overload farming")
Items are **only** produced by intentionally friendly-firing your own already-full-HP captured turret until 500 `itemDamage` accumulates (§2.5). There is no passive/automatic item generation over time.

```
setItemLoading(game):
    u = number of turrets currently owned by this turret's team
    m = 0.115 * u + 0.137
    cost = 1.2 * m^2
    itemLoadingTimer = cost
    fullLoadingTimer = cost
```

| Team's turret count (u) | m | cost (seconds) |
|---|---|---|
| 1 | 0.252 | ≈0.08 |
| 5 | 0.712 | ≈0.61 |
| 10 | 1.287 | ≈1.99 |
| 13 | 1.632 | ≈3.20 |
| 20 | 2.437 | ≈7.13 |
| 25 | 3.012 | ≈10.88 |

- **Rule [anti-snowball mechanic]**: the more turrets a team currently controls, the *longer* every one of that team's turrets is paused (and thus vulnerable/unable to fire) after triggering an item drop. A team that owns few turrets can farm items on those turrets very cheaply (sub-second pause); a dominant team pays an increasingly steep vulnerability cost (up to ~11 seconds) for the same action.
- While `itemLoadingTimer > 0`, the turret's `frame()` logic returns immediately after ticking the timer down — **it does not fire under any circumstance during this window**, regardless of enemy presence, `team`, or `startCooldown` state. This check happens before the "uncaptured turrets do nothing" and "startCooldown" checks, so it overrides everything else.
- When the timer expires: `itemDamage = 0; itemsToSpawn += TURRET_ITEM_COUNT (2)`. Two items are then spawned that same frame (see §2.9), and the turret resumes normal behavior (attack cooldown, `startCooldown` if still pending, etc.) on the next frame.

### 2.8 Turret attack behavior (per frame, once un-paused and `team ≠ null`)
```
if startCooldown > 0:  startCooldown -= dt; return   # cannot attack yet
attackCooldown -= dt * attackSpeedMultiplier          # boosted by EBooster (§6.7)
if attackCooldown <= 0:
    if no living enemy player AND no enemy ETank/EBooster currently inside
       the ROOM_SIZE (3600×3600) box centered on this turret:
        return   # stays silent, cooldown not reset — will re-check next frame
    attackCooldown = TURRET_COOLDOWN (2.0s)
    fire 250 bullets in a full circle (angle step = 2π/250), speed 5000, travel distance = TURRET_RADIUS (1440), owner = -1 (turret-fired)
```
- 250 bullets spawn simultaneously at very high speed (5000) over a short travel distance (1440), effectively an instantaneous full-circle damage "pulse" covering the entire kill radius rather than a slow expanding ring.
- `owner = -1` marks these as turret-fired bullets: per §9.5 they **cannot damage other turrets**, only players (subject to normal team-friendliness and no-damage-zone checks — see §2.4/§9.5, §7).
- Damage per bullet: `BULLET_DAMAGE = 15` (same flat value used for all bullets in the game).

### 2.9 Item spawn placement
```
while itemsToSpawn > 0:
    angle = spawnIdx * (π/4)          # 8 possible directions, 45° apart
    itemX = turret.x + cos(angle) * TURRET_RADIUS (1440)
    itemY = turret.y + sin(angle) * TURRET_RADIUS (1440)
    itemId = ITEMS_CYCLE[game.makeCycleStep()]   # deterministic sequence, see §5.3
    spawn ItemInMap(itemX, itemY, itemId)
    spawnIdx += 3
    itemsToSpawn -= 1
```
- Since `spawnIdx` increments by 3 out of 8 possible 45°-step positions, the two items from a single production batch land 135° apart on the ring at radius 1440 around the turret (i.e., at the very edge of the turret's own kill radius, not near its small physical body).
- Item pickups are static once dropped; they persist until picked up (no expiry code present).

---

## 3. Score, Match Timer, and Win Condition

### 3.1 Match timer
- `time` starts at `600` (10 minutes), decremented by `dt` every frame.

### 3.2 End conditions (either triggers `finished = true`)
```
if time <= 0
   OR (redScore + blueScore) >= turrets.length (25):
    finished = true
```
- The second condition triggers once **every** turret has been captured by *some* team (no neutrals left) — this can happen well before the 10-minute timer, and does not require one team to own all 25; any split (e.g., 13–12) that leaves zero neutral turrets ends the match immediately.

### 3.3 Score bookkeeping
- `redScore` and `blueScore` are updated the frame **after** a capture occurs (the `prevCapture` flag set during `capture()` is consumed at the top of the *next* `turret.frame()` call):
  - Capturing a **neutral** turret: `+1` to the capturing team's score only.
  - Flipping a **red-owned** turret to blue: `redScore -= 1; blueScore += 1`.
  - Flipping a **blue-owned** turret to red: `redScore += 1; blueScore -= 1`.
- **Consequence**: at all times, `redScore` and `blueScore` equal the number of turrets each team currently controls. This is the sole objective metric.

### 3.4 Determining the winner (`produceFinish`)
- Teams are ranked **primarily by final `redScore` vs `blueScore`** (more turrets owned = win). Equal scores are flagged as a team-level tie (`teamEqualities`).
- **Within each team**, players are ranked by individual `kills` (descending); equal kill counts between adjacent players are flagged as player-level ties (`playerEqualities`).
- **Rule**: individual kills never affect which *team* wins — they are used purely as an intra-team ranking/leaderboard statistic.

---

## 4. Player

### 4.1 Core stats and constants
| Constant | Value | Meaning |
|---|---|---|
| `MAX_HP` | 600 | Max/starting HP |
| `HP_INC` | 100 | HP regen per second once eligible |
| `HEAL_COOLDOWN` | 3 (s) | Time after last damage taken before regen resumes |
| `RADIUS` | 60 | Collision radius |
| `SPEED` | 2000 | Base top movement speed (units/s) |
| `ACCELERATION` | 12000 | Accel toward target speed when under it |
| `SOFT_DECELERATION` | 12000 | Decel toward 0 when no input given |
| `QUICK_DECELERATION` | 40000 | Decel when moving opposite the desired direction |
| `MIN_DECELERATION` | 1100 | Slow "coast-down" decel when current speed exceeds target (e.g., after a speed buff ends) |
| `COOLDOWN` | 2.0 (s) | Respawn delay after death |
| `ATTACK_FULL` | 5.0 | Max ammunition pool (measured in seconds of sustained fire) |
| `ATTACK_RELOAD` | 3.0 /s | Regen rate once idle past `ATTACK_COOLDOWN` |
| `ATTACK_SLOW_RELOAD` | 1.8 /s | Forced full-lockout regen rate after hitting 0 ammo |
| `ATTACK_COOLDOWN` | 2.0 (s) | Idle time after last shot before regen (at the fast rate) begins |
| `ATTACK_DELAY` | 0.5 (s) | Time between bullet volleys while continuously firing |

`PUSH_DOWN (1000)`, `THROW (1200)`, `BOUNCE_X (1000)`, `BOUNCE_Y (100)`, `GRAB_GRAVITY (900)` are declared on `Player` but have **no visible usage** in the provided source — mark as **[UNKNOWN]** purpose/effect.

### 4.2 Movement physics (`applyMovement`, run every frame with `dt`)
Given input direction `(dirX, dirY)` (magnitude clamped to ≤1) and current velocity `(vx, vy)`:

```
if dirX == 0 and dirY == 0:
    # No input: soft-decelerate toward zero
    speed = |v|
    if speed <= SOFT_DECELERATION * dt: v = 0
    else: v *= (speed - SOFT_DECELERATION*dt) / speed
    return v

forwardSpeed = v · dir            # component of current velocity along input direction
if forwardSpeed < 0:
    # moving opposite to desired direction: quick-decelerate
    if speed <= QUICK_DECELERATION * dt: v = 0
    else: v *= (speed - QUICK_DECELERATION*dt) / speed
    return v

targetSpeed = SPEED * speedMultiplier * |dir|
if forwardSpeed < targetSpeed:
    # accelerate toward target speed along dir
    newSpeed = min(forwardSpeed + ACCELERATION*dt, targetSpeed)
    v = dir_normalized * newSpeed
elif speed > targetSpeed:
    # currently faster than target (e.g. buff just ended): slow coast-down
    newSpeed = max(speed - MIN_DECELERATION*dt, targetSpeed)
    v = v_normalized * newSpeed
# else: unchanged
```
**Timing implications** (at `speedMultiplier = 1`):
- 0 → top speed (2000): ≈0.167s (`2000/12000`).
- Top speed → 0 with no input: ≈0.167s (`2000/12000`).
- Reversing direction from top speed: ≈0.05s (`2000/40000`) — near-instant turnaround.
- Coasting down from a Star-buffed speed (1.6× = 3200) back to normal top speed (2000) after the buff ends: `(3200-2000)/1100 ≈ 1.09s` — a **noticeably slow bleed-off**, not an instant snap back to normal speed.
- Input magnitude < 1 (analog/joystick) proportionally lowers `targetSpeed`, allowing fine speed control.

### 4.3 Health and regeneration
```
on hit(damage):
    healCooldown = HEAL_COOLDOWN (3)   # reset every time damage is taken
    hp -= damage
    if hp <= 0: die()

each frame:
    if healCooldown > 0: healCooldown -= dt
    if healCooldown <= 0: hp = min(hp + HP_INC*dt, MAX_HP)
```
- Regen is fully suppressed while `healCooldown > 0`; **any** new damage, however small, resets the 3-second window, so sustained pressure denies all natural healing.
- Full regen from 0 HP (once no further damage lands) takes `3s cooldown + 6s regen (600/100) = 9s` total.

### 4.4 Invincibility (`hit()` early return)
```
if invincible or hp <= 0: return   # no damage, no healCooldown reset, no state change
```
- An invincible player (Star buff active) takes **zero** damage from any source and, critically, **keeps regenerating HP uninterrupted** even while being shot, since the `healCooldown` reset line is never reached.

### 4.5 Death and respawn
```
die():
    vx = vy = 0
    alive = COOLDOWN (2.0)     # counts DOWN; isAlive() == (alive < 0)
    hp = 0
    healCooldown = HEAL_COOLDOWN

each frame, move(dt):
    if alive >= 0:
        alive -= dt
        if alive >= 0: return          # still dead/respawning — frozen, cannot move or act
        # transition to alive this frame:
        x, y = spawnX, spawnY           # fixed home spawn point, see §1.3
        hp = maxHp                       # full heal
        attackMunitions = ATTACK_FULL
        attackFullyReloading = false
        attackCooldown = 0
        attackTimer = ATTACK_DELAY       # ready to fire immediately
    # normal movement/heal/attack-cooldown logic continues below
```
- While `alive >= 0` (dead), the player is **completely frozen** — no movement processing, and `attackLogic` requires `isAlive()` to attempt any attack or item throw, so a dead player cannot act at all for exactly 2.0 seconds.
- **Rule**: inventory items in the 3 slots are **not** cleared or reset on death — held items persist through death and are available again upon respawn.
- **Rule**: `kills` count is never reset by death (it is a running match total).

### 4.6 Kill credit
- A `kills` increment happens **only** inside `Player.hit()` when `hp <= 0` and a non-null `attacker` Player object is supplied.
- Only `Bullet.attack()` on a `player`-kind target supplies an `attacker`, and only when the bullet's `owner >= 0` (i.e., **player-fired bullets only**). Turret-fired bullets (`owner = -1`) never credit a kill to anyone. AoE item explosions (`damageAllInRadius`, used by Balloon and Trap) explicitly pass `attacker = null`, so **kills from balloons or traps are never credited to any player**, even if they finish off the target.
- **[INFERRED]** This incentivizes landing the literal killing bullet personally for individual stat credit, layered on top of the team-based turret-control objective, which does not care about kills at all.

---

## 5. Items — General System

### 5.1 Inventory
- Each player has exactly `ITEM_COUNT = 3` inventory slots, each holding an item ID (`-1` = empty) plus a `selectedItem` index (`-1` = nothing armed).

### 5.2 Picking up / arming (`interactWithSlot(slot)`, triggered by pressing key `1`/`2`/`3` or the equivalent mobile button)
```
if slot == selectedItem:
    selectedItem = -1                        # pressing the armed slot's key again disarms it
    return

# find if standing on a ground item: distance <= ItemInMap.RADIUS(40) + Player.RADIUS(60) = 100
if standing on a ground item (first match in array order, not necessarily nearest):
    swapOrPickupItem(slot, thatItem):
        oldSlotItem = items[slot]
        items[slot] = groundItem.id
        if oldSlotItem != -1:
            groundItem.id = oldSlotItem       # swap: old item is left on the ground at the SAME spot
        else:
            remove groundItem from itemsInMap  # slot was empty: item fully picked up
else:
    selectedItem = slot                        # simply arms/aims the chosen slot
```
**Edge case / constraint**: if a player is currently standing on a ground item, pressing a slot key **always** triggers the pickup/swap branch, never the arm/aim branch — even if the player only intended to arm an item already in that slot. To arm an existing inventory item while standing on a pickup, the player must step off the pickup first.

### 5.3 Throwing / using an item (`executeItemAttack`, runs inside `attackLogic` every frame while `selectedItem != -1` and a `target` is set and the player is alive)
```
itemId = items[selectedItem]
if itemId == -1: selectedItem = -1; return     # empty slot auto-cancels (1 extra no-op frame)
(dx, dy) = resolveTargetVector(target)           # see §7
nextItemId = ITEMS[itemId].run(game, owner, dx, dy)
if nextItemId == null:
    items[selectedItem] = -1                     # item fully consumed, slot empties
else:
    items[selectedItem] = nextItemId              # item downgrades in place (Trap chain only)
    target = null                                  # explicitly stops continuous throwing
attackCooldown = ATTACK_COOLDOWN (2.0)
```
- **Rule**: because `executeItemAttack` runs every frame the aiming conditions hold, an item that fully consumes itself (`nextItemId == null`) still lets one extra frame pass (with `itemId == -1`) before the game auto-clears `selectedItem` — this has no material effect beyond one frame of no-op.
- **Rule**: only the Trap chain (§6.8) explicitly sets `target = null` after use, which is what prevents multiple traps from being spam-placed within a single held aim/click — all other items rely on the natural one-shot consumption above.
- Throwing an item sets `attackCooldown = 2.0`, the same field used to gate standard-attack ammo regeneration while idle (§8.3) — so using an item also delays the *next* standard-attack regen cycle by up to 2 seconds if the player then stops attacking, though it does **not** block firing standard-attack bullets on the very next frame if the player re-engages a target (that check only inspects `attackMunitions`, not `attackCooldown`; see §8).

### 5.4 Item drop table (`ITEMS_CYCLE`, a fixed 50-entry deterministic sequence, advanced one step per item spawned via `makeCycleStep()`, wrapping back to index 0 after 50 draws)
Frequency of each item ID across the 50-entry cycle:

| ID | Item | Occurrences / 50 | Approx. rate |
|---|---|---|---|
| 0 | LifeSlider | 8 | 16% |
| 1 | ShieldSlider | 8 | 16% |
| 2 | Wall | 13 | 26% (most common) |
| 3 | Ballon | 5 | 10% |
| 4 | Tank | 7 | 14% |
| 5 | Booster | 5 | 10% |
| 6 | Star | 1 | 2% (rarest by far) |
| 7 | TrapIII | 3 | 6% |

**[INFERRED]** Star is extremely rare (1 in 50 draws) but, as documented in §6.7, is arguably the single strongest individual buff in the game (full invincibility + speed for 10s, with uninterrupted healing) — encountering one should be treated as a high-value event.

---

## 6. Items — Individual Definitions

Each item's `run(game, owner, dx, dy)` executes once per successful throw (see §5.3). `(dx, dy)` is the raw (unnormalized) vector toward the resolved target (§7).

### 6.1 LifeSlider (ID 0)
- Spawns `ELifeSlider` at the owner's position, moving in the normalized `(dx,dy)` direction at `SPEED = 125` (slow), with `RADIUS = 500` (large).
- **Effect while alive**: any point inside the slider's radius is a **no-damage zone for every player and troop entity, of BOTH teams** (`protects()` ignores team). This blocks damage from **any bullet source, including enemy players and enemy turrets**, but explicitly **does not protect turrets themselves** (the no-damage-zone check in `Bullet.attack()` is skipped for turret targets).
- Lifetime: travels until fully out of bounds (`isOOB`, margin = its own radius) — given the slow speed (125/s) and the ±18000 despawn boundary, this entity can remain active for a very long time (potentially tens of real seconds to minutes depending on spawn location and direction) if not blocked or left behind.
- Consumed entirely on throw (`nextItemId = null`).

### 6.2 ShieldSlider (ID 1)
- Like LifeSlider but faster (`SPEED = 200`), smaller (`RADIUS = 200`), and **only protects the owner's own team** (`protects()` checks `team === this.team`).
- Consumed entirely on throw.

### 6.3 Wall (ID 2)
- Spawns a static `EWall` square (`SIZE = 180`) at the owner's current position (not aimed — `dx,dy` are unused by this item's `run`).
- **Effect**: `Bullet.attack()` checks `isBlockedByWall()` **before any other logic**, including before team/target checks — a wall blocks **any bullet from any source and any team**, including the owner's own team's bullets and even a friendly turret's own defensive bullets, if the geometry intersects.
- Duration: `TOTAL_DURATION = 10 * DURATION(3) = 30` real seconds. The UI displays a countdown in "DURATION units" (`timer / 3`), i.e., a number from 10.0 down to 0.0, not raw seconds.
- Consumed entirely on throw.

### 6.4 Ballon (ID 3)
- Spawns `EBallon` at the owner's position, belonging to the owner's team, starting `radius = 0`, `growthSpeed = 0`.
- **Growth** (every frame): `growthSpeed += GROWTH_ACCELERATION(60) * dt; radius += growthSpeed * dt` — radius grows under constant acceleration (quadratically over time, `r(t) ≈ 30·t²`).
- **Detonation trigger** (`detectsEnemy`, checked every frame): explodes if **either**:
  - any living **enemy** player is within `radius + Player.RADIUS(60)` of the balloon center, **or**
  - **any turret at all, of either team (including the balloon's own team's turret)**, is within `radius + Turret.SIZE(100)` — team is not checked for the turret trigger condition.
- **On detonation**: `damageAllInRadius(x, y, radius + PADDING(120), team, DAMAGE(150), spareTurrets: true)` — deals 150 damage to every enemy player/entity within the (slightly larger) blast radius, but **turrets are always spared from the actual damage** even though a turret's mere presence can be what triggered the explosion. `exploded = true`; the entity is removed on the *following* frame (one extra frame for a visual "boom" state).
- Consumed entirely on throw.
- **[INFERRED]** Because any turret (friend or foe) can prematurely trigger the balloon, placing one very close to your own turret risks an early, wasted detonation if no enemy is nearby to actually be damaged.

### 6.5 Tank (ID 4)
- Spawns `ETank` (`MAX_HP = 400`) at the owner's position, belonging to the owner's team.
- **Behavior** (every frame): finds the nearest **captured, enemy-owned** turret (`game.nearestEnemyTurret` — ignores neutral turrets) and walks straight toward it at `SPEED = 250`. If none exists, it stays in place.
- **On contact** (distance ≤ `RADIUS(50)` from the target turret's center): the tank dies, dealing `TURRET_DAMAGE = 25` to that turret via the normal "enemy fire" turret-hit path (§2.5) — i.e., it can both reduce HP and, if it finishes the turret off, capture it.
- **Vulnerability**: the tank is a `damageableEntities()` participant (`kind: 'entity'`) and can be killed in transit by any bullet that is not from its own team (400 HP; roughly ~27 bullet hits of 15 damage, fewer with multi-bullet volleys).
- Consumed entirely on throw. Deals no damage to players, ever.

### 6.6 Booster (ID 5)
- Spawns `EBooster` (`MAX_HP = 300`) at the owner's position, belonging to the owner's team.
- **Behavior**: walks toward the nearest **friendly, captured** turret at `SPEED = 350`.
- **On contact** (distance ≤ `RADIUS(30)`): every frame it remains attached, it calls `target.applyFastAttackEffect(BUFF_ADDER = 0.5)` on that turret (adding to `attackSpeedMultiplier`, which is wiped to 1 every global frame and re-applied here) **and simultaneously self-damages** at `FRAME_DAMAGES(30) * dt` per second. It dies (and detaches) once its own HP reaches 0, i.e., after `300/30 = 10` seconds of continuous buffing.
- **Effect**: while attached and alive, the target turret fires `50%` faster per attached booster (its `attackCooldown` decrements at `dt * (1 + 0.5·n)` for `n` simultaneously-attached boosters — effects stack additively if multiple boosters reach the same turret).
- **Vulnerability**: like the Tank, damageable by enemy bullets while approaching (300 HP).
- Consumed entirely on throw. Never damages anything itself.

### 6.7 Star (ID 6)
- Immediately attaches `EStar` to the **owner** (no travel — `dx,dy` are unused).
- **Effect, every frame while active**: sets `player.invincible = true` and `player.speedMultiplier = max(current, 1.6)` on the owning player (re-applied every frame, following the wipe-and-reapply pattern, §4.4/§4.2), and follows the player's position. Duration: `STAR_DURATION = 10` real seconds, counted down each frame.
- **Combined effect**: for 10 seconds, the player takes zero damage from any source (§4.4), regenerates HP uninterrupted, and moves at 1.6× top speed (§4.2). This is the single strongest buff item in the game.
- Removed once its internal timer expires, the owning player dies, or the owning player reference is otherwise invalid.
- **Known display quirk (non-rule-affecting)**: the UI star-duration bar (`Player.draw`) normalizes against a *local* shadowed constant of `6` seconds rather than the true `STAR_DURATION = 10`, so the visual bar reads as "full" well before the buff actually ends. This is a cosmetic inconsistency only — the actual invincibility/speed effect genuinely lasts 10 seconds.
- Consumed entirely on throw.

### 6.8 Trap chain — TrapIII (ID 7) → TrapII (ID 8) → TrapI (ID 9)
All three spawn the **identical** `ETrap` entity/behavior; they differ only in what is returned to the inventory slot afterward:
```
TrapIII.run -> spawns ETrap; returns ITEM_IDS.TrapII   (slot downgrades, NOT emptied)
TrapII.run  -> spawns ETrap; returns ITEM_IDS.TrapI    (slot downgrades, NOT emptied)
TrapI.run   -> spawns ETrap; returns null              (slot finally empties)
```
- **Rule**: a single Trap pickup therefore yields **3 total trap placements** before being fully consumed — significantly better action economy than any other single item pickup.
- `ETrap` parameters (identical for all three tiers): `TRIGGER_RADIUS = 160` (zone that must be touched to arm/trigger), `EXPLOSION_RADIUS = 260` (wider damage radius once triggered), `DAMAGE = 250`.
- **Trigger condition** (every frame, while untriggered): any **living enemy player** within `TRIGGER_RADIUS` of the trap. Neutral/own-team presence never triggers it (unlike the Balloon's turret-presence trigger).
- **On trigger**: `damageAllInRadius(x, y, EXPLOSION_RADIUS, team, DAMAGE(250), spareTurrets: false)` — **unlike the Balloon, this explosion CAN damage enemy turrets** caught in the blast (only same-team and neutral targets are excluded by `damageAllInRadius`'s own team filter). Removed the frame after triggering.
- **Damage magnitude**: 250 is a very large single hit — nearly 42% of a player's max HP (600) in one blast, and the explosion radius (260) exceeds the trigger radius (160), so an enemy can be caught in the blast even slightly outside the visible trigger zone if triggered by a nearby ally.

---

## 7. Targeting / Aiming System

`Player.target` is one of:
- `{type:'fixed', x, y}` — a static world-space point (desktop: set once per mouse click via `mouse.press(0)`).
- `{type:'delta', dx, dy}` — a raw direction vector, continuously updated (mobile: drag on the attack joystick).
- `{type:'auto'}` — automatic nearest-enemy targeting.
- `null` — not aiming/attacking at all.

`resolveTargetVector(game)` converts the current target into a `(dx, dy)` vector used both for standard bullet aiming and for item throw direction:
```
if type == 'fixed': return (target.x - x, target.y - y)
if type == 'delta':  return (target.dx, target.dy)
if type == 'auto':
    find the closest living enemy player (by Euclidean distance, ignoring turrets)
    if found: return (enemy.x - x, enemy.y - y)     # re-evaluated fresh every frame
    else: return team=='red' ? (0,1) : (0,-1)         # default toward the opposing home row
default: return (0, 1)
```
**Rule**: `'auto'` targeting is re-computed every single frame — if the currently-closest enemy dies or a closer one appears, the aim direction snaps to the new nearest target immediately, without any target "lock-on" persistence.

### 7.1 Input mapping
| Input | Platform | Effect |
|---|---|---|
| Mouse press (button 0) | Desktop | Sets `fixed` target to click point |
| Mouse release | Desktop | Sends `throwOff` → `target = null` |
| `Shift` key (first-press) | Desktop | Sends `throwAuto` → `target = {type:'auto'}` |
| `1`/`2`/`3` keys | Desktop | `interactWithSlot` (§5.2) |
| Attack joystick held+dragged | Mobile | Continuously sends `delta` target matching stick vector |
| Attack joystick released, quick tap (<180ms, never aimed) | Mobile | Sends `throwAuto` → `target = {type:'auto'}` |
| Attack joystick released, held/aimed | Mobile | Sends `throwOff` → `target = null` |
| Mobile slot buttons `1`/`2`/`3` | Mobile | `interactWithSlot` (§5.2) |

**[UNKNOWN / edge case]**: on mobile, a quick tap sets `target = {type:'auto'}` and — based on the code shown — nothing subsequently sends `throwOff` for that state on its own; auto-fire appears to persist until the attack stick is pressed again (which immediately overwrites the target to `delta`). The exact intended mobile "auto-fire toggle-off" behavior beyond this is not fully determinable from the provided code and should be treated as an implementation detail rather than an assumed rule.

---

## 8. Standard (Bullet) Attack System

Runs inside `attackLogic(dt, idx, game)` when `selectedItem == -1`, `target != null`, and the player is alive.

### 8.1 State machine
```
attackLogic(dt):
    if attackFullyReloading:
        processReloading(dt); return
    if target != null and isAlive():
        if selectedItem != -1: executeItemAttack(...)   # see §5.3
        else: executeStandardAttack(dt, ...)
    else:
        processAttackCooldowns(dt)
```

### 8.2 `executeStandardAttack` (firing)
```
if attackMunitions <= 0: return
attackMunitions = max(0, attackMunitions - dt)     # ammo drains continuously while target held
attackCooldown = ATTACK_COOLDOWN (2.0)
attackTimer += dt
if attackMunitions <= 0:
    attackFullyReloading = true; attackTimer = 0; return   # locked out, forced full reload begins
if attackTimer >= ATTACK_DELAY (0.5):
    attackTimer -= ATTACK_DELAY
    fire one volley (all 3 bullet patterns simultaneously, see §8.5)
```
- **Rule**: this path does **not** check `attackCooldown` as a firing gate at all — it is purely `attackMunitions`-gated. `attackCooldown` here is only *set*, to be consumed later by `processAttackCooldowns` once the player stops attacking.
- Ammo (`attackMunitions`, `ATTACK_FULL = 5.0`) represents **5 seconds of continuous holding-fire** before forced lockout.

### 8.3 `processAttackCooldowns` (idle, target released, ammo not yet fully depleted)
```
attackTimer = min(attackTimer + dt, ATTACK_DELAY)     # pre-charges the volley timer for instant next shot
if attackCooldown > 0: attackCooldown -= dt
if attackCooldown <= 0:
    attackMunitions = min(ATTACK_FULL, attackMunitions + dt * ATTACK_RELOAD(3.0))
```
- Regeneration at the fast rate (`3.0/s`) only begins once `attackCooldown` (started at 2.0s from the last shot) has fully counted down. A full regen from empty-but-not-locked-out state would take `5.0/3.0 ≈ 1.67s`, but that state is unreachable without triggering the lockout below.

### 8.4 `processReloading` (forced full lockout, once ammo hit exactly 0 while firing)
```
attackMunitions = min(ATTACK_FULL, attackMunitions + dt * ATTACK_SLOW_RELOAD(1.8))
if attackMunitions >= ATTACK_FULL:
    attackMunitions = ATTACK_FULL
    attackFullyReloading = false
    attackTimer = ATTACK_DELAY   # ready to fire the instant reload completes
```
- Time to fully reload from empty: `5.0 / 1.8 ≈ 2.78s`, during which the player **cannot fire or throw items at all** (`attackLogic`'s very first check short-circuits to this path exclusively).

**[INFERRED / strategic timing]**: sustaining fire for the full 5.0s to empty forces a slower, fully-blind ~2.78s reload with zero output. Releasing the attack input *before* running dry (even briefly) avoids the lockout entirely and, after only a 2.0s idle window, regenerates at the faster 3.0/s rate — so tapping/bursting fire rather than holding continuously to zero is strictly better for sustained damage output over time.

### 8.5 Bullet volley composition (`Bullet.PATTERNS`, all 3 fired simultaneously on every volley)
| Pattern | Bullet count | Spread angle | Travel distance | Initial speed |
|---|---|---|---|---|
| A | 5 | π/64 (≈2.8°) | 1600 | 2000 |
| B | 5 | π/8 (22.5°) | 600 | 1000 |
| C | 5 | π/4 (45°) | 200 | 1000 |

- Total **15 bullets per volley**, each dealing `BULLET_DAMAGE = 15` if it hits (max theoretical 225 damage from one volley if, implausibly, all 15 bullets connect with the same point-blank target — pattern C's wide 45° spread makes this plausible only at extreme close range).
- Pattern A is a long-range, near-single-line burst (precision); Pattern C is a short-range, wide "shotgun" burst — a single volley therefore covers both long-range precision and short-range area coverage simultaneously, regardless of actual target distance.

---

## 9. Bullet Physics and Collision

### 9.1 Bullet creation (`Bullet.create`)
```
length = |(vx0, vy0)|                       # aim direction magnitude (usually 1, from pattern angle)
(dx, dy) = (vx0/length, vy0/length)          # normalized aim direction
(vx, vy) = (dx*initSpeed + sx, dy*initSpeed + sy)    # sx,sy = shooter's current velocity — ADDED to the bullet
initSpeed = |(vx, vy)|                        # recomputed AFTER adding shooter velocity
a = initSpeed^2 / (2 * dist)                   # deceleration constant
```
- **Rule**: the shooter's own current velocity `(sx, sy)` is added as a vector offset to the bullet's initial velocity, not just its speed — this can visibly skew the bullet's actual travel direction away from the aimed direction if the shooter is moving sideways or backward relative to the aim.
- **[INFERRED — key physical property]**: because `a` is recomputed from the *final, velocity-boosted* speed and the same fixed `dist`, the bullet's total travel distance before its speed decays to zero is **always exactly `dist`**, regardless of how much extra speed the shooter's own movement added. Shooter movement changes *how fast* the bullet crosses that distance (and slightly skews its heading), but not the maximum range.

### 9.2 Bullet movement (`move(dt)`, every frame)
```
norm = |v|
nextNorm = norm - a*dt
if nextNorm <= 0: return true            # bullet expires this frame (reached max travel distance)
v *= nextNorm / norm                      # linear speed decay, direction preserved
position += v * dt
return isOOB(x, y)                        # also expires if it leaves the ±18000 world bound
```

### 9.3 Bullet collision (`attack(game)`, every frame after moving)
```
if isBlockedByWall(x, y): return true      # consumed, no damage — Wall blocks ALL bullets, any team/source
attacker = owner < 0 ? null : players[owner]
for (target, kind) in game.damageableEntities():   # order: alive players, then all turrets, then ETank/EBooster entities
    if kind == 'turret' and owner < 0: continue      # turret-fired bullets cannot damage/capture turrets
    elif kind != 'turret' and target.team == this.team: continue   # no friendly fire on players/entities
    if distance(target, bullet) > Bullet.RADIUS(10) + target.getRadius(): continue
    if kind != 'turret' and isInsideNoDamageZone(...): continue     # sliders protect players/entities, not turrets
    if kind == 'player': target.hit(BULLET_DAMAGE, attacker)         # attacker credited for potential kill
    else: target.hit(BULLET_DAMAGE, this.team)                      # turret/entity: team-based hit
    return true    # bullet consumed on first hit — no piercing
return false        # no target hit this frame, bullet continues
```
**Key constraints, explicit**:
- A `Wall` blocks a bullet unconditionally, before any team/target logic — **including the shooter's own team's bullets and even a friendly turret's own defensive fire** if the bullet's path intersects the wall.
- Only player-fired bullets (`owner >= 0`) can ever hit turrets; turret-fired bullets pass straight through other turrets untouched.
- Friendly fire is explicitly disallowed on players and troop entities (Tank/Booster) — same-team bullets simply pass through them — but friendly fire on turrets is allowed and is in fact the entire basis of the item-farming mechanic (§2.5).
- No-damage zones (Life/Shield Slider) protect players and troop entities from **any** bullet (player- or turret-fired) but never protect turrets.
- Each bullet can hit at most one target and is removed immediately upon doing so.

### 9.4 `damageableEntities()` iteration order and membership
Yields, in order: every **living** player (`[p, 'player']`), then **every** turret regardless of state (`[t, 'turret']`), then every `ETank` or `EBooster` currently in `entities` (`[e, 'entity']`). Dead players, and all other entity types (sliders, walls, balloons, stars, traps), are never included — they cannot be "hit" via this mechanism (though Balloon/Trap deal damage *outward* via `damageAllInRadius`, they are not themselves damageable targets for bullets, aside from Tank/Booster which explicitly expose `hit()`/`getRadius()` and participate here).

### 9.5 `damageAllInRadius` (used by Balloon §6.4 and Trap §6.8)
```
for (target, kind) in damageableEntities():
    team = target.getTeam()
    if team == sourceTeam: continue                      # never hits own team
    if team == null: continue                              # NEVER hits neutral turrets
    if options.spareTurrets and kind == 'turret': continue  # Balloon only: turrets immune to the blast itself
    if distance(target, center) > radius: continue
    if isInsideNoDamageZone(target...): continue            # sliders still protect against AoE too
    target.hit(damage, kind=='player' ? null : sourceTeam)   # note: player kills from AoE are NEVER credited (attacker=null)
```
- **Rule**: AoE damage (Balloon, Trap) can never affect neutral turrets under any circumstance — only already-captured (red or blue) turrets can be damaged by an area explosion, and then only by the Trap (Balloon explicitly spares all turrets via `spareTurrets: true`).

---

## 10. Entity Frame-Effect Model (buff wipe/reapply pattern)

Certain gameplay-affecting fields are **wiped to their default every single frame, before entities run**, and must be **actively re-applied every frame** by whichever entity currently grants them, in this exact order within `GMTurrets.run(dt)`:

```
1. this.resetEffects()          # players: invincible=false, speedMultiplier=1, starDuration=-1
                                  # turrets: attackSpeedMultiplier=1
2. this.runEntities(dt)          # EStar / EBooster (and all others) execute here, re-applying their buffs
3. turret.frame(dt) for all      # turrets act using this frame's (possibly re-buffed) attackSpeedMultiplier
4. player.move/attackLogic       # players act using this frame's (possibly re-buffed) invincible/speedMultiplier
5. bullets move + collide
```
**Rule/consequence**: a buff (Star's invincibility/speed, Booster's fire-rate boost) is only active for as long as its owning entity is alive **and** its `run()` method executes that frame to re-apply it. If the owning entity is removed (expired, killed, out of range) on a given frame, the buff reverts to baseline on the very next frame's `resetEffects()` call — there is no lingering/decaying tail; buffs are binary present/absent per-frame, not smoothly interpolated (the smooth "coast-down" the player *feels* after a Star ends comes entirely from the separate movement-physics `MIN_DECELERATION`, §4.2 — the speed multiplier itself drops instantly).
- Because turret/player logic runs strictly **after** entity buff re-application within the same frame, buffs feel instantaneous with no one-frame delay.
- Multiple simultaneous `EBooster`s attached to the same turret stack additively (each contributes `+0.5` to `attackSpeedMultiplier` that frame).

---

## 11. Observation / Information Systems (non-mechanical, presentation only)

The **camera** (smooth room-to-room transition, `Camera.SCALE = 0.7`, `Camera.DURATION = 0.3s`) and general rendering are purely client-side visual presentation and do **not** affect the server-authoritative simulation described above; they are not documented further as gameplay rules.

The **minimap**, however, is a genuine information channel available to the player (not merely cosmetic) and can influence decisions:
- Shows all 25 turret cells colored by current owner (red/blue/neutral), and for owned turrets, whether they are currently in the item-loading pause state (a filled inner square shrinking as the pause proceeds) — i.e., **the minimap reveals to any player, anywhere on the map, which of their team's (and implicitly the enemy's) turrets are currently vulnerable due to item-farming**, since this is drawn per-turret without regard to which room the observing player is in.
- Shows the position of every item currently lying on the ground map-wide.
- Shows the position of every player (colored by team, with the local player highlighted distinctly).
- **[INFERRED]** Because loading-state visibility is global (not limited to the player's own room), a coordinated team can identify and exploit an enemy turret's farming-induced vulnerability window from anywhere on the map, and equally must be aware their own farming is visible to the enemy the same way.

---

## 12. Match Setup / Team Assignment (`createServ`)

- Total player slots (`total`) are split as evenly as possible between teams, `maxPerTeam = ceil(total/2)`.
- **Phase 1**: players with an explicit stated preference (`preferTeam` 1=red, -1=blue) are assigned to that team if it still has capacity.
- **Phase 2**: remaining unassigned players are auto-balanced — assigned to whichever team currently has fewer players; on an exact tie, alternates by player index parity (even index → red-first).
- **Phase 3**: every player is placed at their team's fixed home spawn point (§1.3) and the initial turret layout (§2.2) is fixed regardless of team assignment method.
- This is a one-time setup step; it does not recur mid-match (no mechanic for switching teams later is present in the code).

---

## 13. Interaction & Emergent-Behavior Summary (cross-cutting, [INFERRED])

| Interaction | Consequence |
|---|---|
| Turret item-farming (§2.7) vs. turret capture/defense (§2.4–2.6) | Farming your own full-HP turret is the only way to generate items, but it disables that turret's ability to fire for a duration that grows the more turrets your team already owns — a genuine risk that scales against the leading team, discouraging unchecked farming while dominant and rewarding it while behind. |
| LifeSlider/ShieldSlider (§6.1–6.2) vs. Wall (§6.3) | Sliders create moving no-damage zones for players but never protect turrets; Walls block bullets outright (any source) but don't move and can accidentally block a team's own turret-capturing shots or its own turret's defensive fire if placed badly. |
| Balloon turret-trigger (§6.4) vs. Trap enemy-only-trigger (§6.8) | Balloons are unsafe to place near *any* turret (including your own) since any turret's mere presence can pop it early for no benefit; Traps are safe to place near friendly assets since only living enemy players arm them. |
| Trap `spareTurrets:false` (§6.8) vs. Balloon `spareTurrets:true` (§6.4) | Traps are the only AoE item that can meaningfully damage an enemy-owned turret (up to 250 damage per trigger) — a viable siege tool against turret HP that Balloons cannot replicate. |
| Tank (§6.5) vs. Booster (§6.6) vs. turret room-detection box (§2.3, §2.8) | Both troop types are frail to bullets in transit but immune to team-based bullet friendly-fire; a Tank entering the enemy turret's room (not just its 1440 kill radius) will itself trigger that turret to fire on the whole room, potentially hitting the Tank's escorting players even before the Tank reaches contact range. |
| Booster stacking (§6.6, §10) | Multiple Boosters reaching the same turret simultaneously stack their +0.5 fire-rate multiplier additively, materially compounding a turret's damage output during a defense — a strong reason to protect approaching friendly Boosters with escort fire. |
| Ammo burst-vs-hold discipline (§8.2–8.4) | Firing in bursts and releasing before the 5.0s ammo pool empties avoids the far slower, fully-blind 2.78s forced reload, making burst-fire strictly more ammo-efficient over time than holding to empty. |
| Star rarity and power (§5.4, §6.7) | Because Star is both the rarest drop (1/50) and by far the strongest individual buff (invincibility + speed + uninterrupted healing for 10s), securing one — or denying it to the enemy — is disproportionately impactful relative to its drop rate. |
| Turret detection box vs. kill radius (§2.3) | A player can safely linger in a captured/neutral room's corner areas (distance > 1440 from the turret but still inside the room, distance ≤ ~1800–2546) to bait/consume a turret's attack cooldown without taking damage, buying a safe window for allies elsewhere in the same room. |
| Post-capture vulnerability (§2.6, §2.8) | Any freshly captured turret is defenseless for a fixed 5.0s regardless of team dominance — a window that does not scale down even for a team that has captured many turrets, unlike the item-farming pause which does scale up. |

---

## 14. Final Strategic Synthesis

### 14.1 Core loop
1. **Observe**: current HP/ammo, nearby enemies/allies, held items, and — via the minimap — the ownership and vulnerability (loading-pause) state of all 25 turrets map-wide.
2. **Decide** a short-term tactical objective (fight, retreat, capture, farm, support, item-hunt) and a longer-term strategic objective (which turret(s) to press or defend).
3. **Act**: move (with the acceleration/deceleration model), aim (fixed/delta/auto), fire standard bullets or a held item, or interact with a ground item/inventory slot.
4. **Consequence**: bullets travel and resolve hits; turret activation/HP/itemDamage state updates; players take damage/die/respawn; entities (sliders/walls/balloons/tanks/boosters/stars/traps) advance and may trigger.
5. **State update**: turret ownership may flip (updating team scores the following frame); items may spawn; buffs may expire and reset next frame.
6. **Loop** back to observation, now under the new state, continuing until the match timer expires or all 25 turrets are captured.

### 14.2 Win conditions / objectives
- **Primary objective**: control more turrets than the enemy team (`redScore` vs `blueScore`, exactly equal to turret counts) at the moment the match ends.
- **Match ends** when either `time <= 0` (600s hard cap) **or** all 25 turrets have been captured by someone (no neutrals remain).
- **Secondary/individual objective**: maximize personal `kills` (from direct player-bullet kills only) for intra-team ranking — this never changes which team wins.

### 14.3 Key mechanics (highest decision impact)
1. Turret capture mechanics (activation tug-of-war for neutral turrets; direct HP damage for captured ones) — this is the entire win condition.
2. Turret item-farming vulnerability window, scaling with team turret count — governs *when* it is safe to generate items.
3. Player ammo burst-vs-lockout dynamics — governs sustainable damage output in extended fights.
4. The three-tier no-damage/blocking items (LifeSlider, ShieldSlider, Wall) — governs area denial and damage mitigation.
5. Post-capture 5s vulnerability window on every turret — governs immediate follow-up push/defense timing.

### 14.4 Main strategies (derived, not explicitly labeled in code)
- **Siege/push**: mass player fire (and Trap placements, which uniquely can also hurt enemy turret HP) against a specific enemy-owned turret to flip it, ideally timed to exploit its item-farming pause if observable on the minimap.
- **Turtle/defend**: hold ground near an owned turret, retreat behind Walls/Shield Sliders when pressured, and farm items opportunistically only while turret count is low enough that the farming pause stays short.
- **Neutral-zone rush**: contest the middle-row neutral turrets early, since damage there is a shared tug-of-war and a coordinated push (multiple players focusing one attacker's team color) overwhelms lone contestors quickly.
- **Support/utility play**: run Tank/Booster items toward the front — Tanks chip enemy turret HP for free (at the cost of the item and some travel time under fire), Boosters materially speed up a defending turret's fire rate if they survive the approach.
- **Opportunistic looting**: prioritize picking up drops (especially the rare Star) near contested turrets, since production is tied to farming activity and thus clusters around actively-fought turrets.

### 14.5 Critical decisions
- **When to farm your own turret for items** — must weigh the (team-size-dependent) vulnerability duration against the immediate tactical risk of an enemy push at that location.
- **When to release the attack input** before ammo hits zero, to avoid the long forced reload.
- **Whether to commit a Wall/Slider/Balloon in a location where it could backfire** (Wall blocking your own capture shots; Balloon self-triggering near your own turret).
- **Whether to hold a Trap charge for its 3-use potential** rather than spending it immediately, given its very high per-trigger damage (250) and ability to hit enemy turrets directly.
- **Team assignment/spawn is fixed** — players cannot choose to redeploy to a different home base, so long cross-map pushes are a standing structural cost to weigh into any far-side offensive.

### 14.6 Action timing (most important cases)
```text
IF holding standard attack and attackMunitions is close to 0 (e.g. < ATTACK_DELAY worth of ammo remaining)
    AND immediate continued damage is not critical
    THEN release the attack input NOW to avoid the ~2.78s full-lockout reload
ELSE continue firing

IF a friendly, full-HP turret needs items
    AND the team's current turret count is low (short farming pause)
    AND no enemy is immediately threatening that room
    THEN farm it now (friendly-fire it to trigger the 500-itemDamage threshold)
ELSE avoid farming, or farm only opportunistically with escort cover, since the pause duration grows with team turret count and leaves the turret briefly defenseless either way

IF a turret was just captured (by either team) within the last TURRET_START_COOLDOWN (5.0s)
    THEN treat it as fully defenseless — this is the highest-value window to either consolidate the capture (attacking team) or attempt an immediate recapture (defending team)

IF placing a Balloon
    AND any turret (including a friendly one) is within its eventual maximum growth radius + Turret.SIZE
    THEN expect early/wasted detonation unless an enemy will also be in range at that moment

IF placing a Wall
    THEN verify it will not sit between yourself/allies and a turret you still intend to shoot, since it blocks all bullets indiscriminately
```

### 14.7 Common mistakes (mechanically possible but strategically inefficient)
- Holding the attack input continuously until ammo fully depletes, incurring the slow full-lockout reload instead of the faster idle-cooldown regen path.
- Overloading (farming) turrets for items while your team already controls many turrets, incurring a long, costly vulnerability window for a relatively cheap item drop, especially if unescorted.
- Dropping a Balloon adjacent to any turret (own or enemy) without a clear enemy present, wasting the item on an early, harmless detonation.
- Placing a Wall in a position that blocks the user's own line of fire toward a turret or enemy.
- Sending a Tank or Booster toward its target without any escort, letting it be shot down in transit before it can deliver its (turret-damage or fire-rate-buff) effect.
- Standing still to reload/regen HP in the open interior of an enemy-owned turret's room (well within `TURRET_RADIUS`) instead of retreating to a room corner or off the detection box entirely.
- Treating individual kill count as if it affects the match's win condition — it does not; only turret control does.

### 14.8 AI decision framework

**1. List of possible decisions** (words only):
- Advance-and-fight
- Retreat/disengage
- Capture-push (neutral or enemy turret)
- Defend-turret
- Farm-turret (item production)
- Throw-defensive-item (Slider/Wall)
- Throw-offensive-item (Balloon/Trap)
- Deploy-support-entity (Tank/Booster)
- Use-Star (or hold it)
- Loot/pickup-item
- Reposition-for-safety (corner-camp / floor navigation)
- Idle-regen (hold position to heal/reload)

**2. Decision descriptions** (idea, cost, benefit, objective):
- *Advance-and-fight*: engage a visible enemy player with standard bullets. Cost: exposes self to return fire and depletes ammo toward lockout. Benefit: potential kill (personal ranking) and clears enemy presence from a contested area, indirectly enabling turret pushes. Objective: local area denial.
- *Retreat/disengage*: stop attacking, move away from danger, let `target=null` so `processAttackCooldowns` begins the faster regen path. Cost: cedes ground/tempo. Benefit: preserves HP and ammo, avoids the forced lockout. Objective: sustain future combat effectiveness.
- *Capture-push*: concentrate fire on a specific neutral or enemy turret. Cost: sustained exposure to that turret's defensive pulse (if captured) and to defenders. Benefit: direct progress toward the win condition. Objective: increase own team's `redScore`/`blueScore`.
- *Defend-turret*: hold position near an owned turret to intercept attackers before they can flip it. Cost: opportunity cost of not pushing elsewhere. Benefit: prevents enemy `activation`/HP progress and preserves score. Objective: protect the win-condition resource.
- *Farm-turret*: friendly-fire a full-HP owned turret to reach the 500-itemDamage threshold. Cost: the triggering shot's HP loss plus a defenseless pause scaled to team turret count. Benefit: 2 items generated at that location. Objective: acquire strategic resources (buffs/utility) at a calculated, team-size-dependent risk.
- *Throw-defensive-item*: deploy LifeSlider/ShieldSlider/Wall to block or negate incoming damage. Cost: consumes the item; Wall can also block friendly fire. Benefit: survivability for self/team in the affected zone. Objective: mitigate incoming damage during a fight or retreat.
- *Throw-offensive-item*: deploy Balloon or a Trap to damage enemies (and, for Trap, potentially an enemy turret). Cost: consumes the item; Balloon risks premature/wasted detonation near any turret. Benefit: burst AoE damage, potentially against a turret's HP (Trap only). Objective: attrition or siege damage.
- *Deploy-support-entity*: send a Tank (turret siege) or Booster (turret fire-rate buff) item toward its automatic target. Cost: consumes the item; the entity is bullet-vulnerable in transit. Benefit: passive turret damage (Tank) or passive turret defense buff (Booster) without further player input. Objective: indirect pressure or reinforcement.
- *Use-Star*: consume a held Star for 10s of invincibility + speed. Cost: uses up an extremely rare resource. Benefit: near-total safety and mobility for the duration, including uninterrupted healing. Objective: force a decisive push, an emergency escape, or an uncontested capture/farm window.
- *Loot/pickup-item*: move onto a ground item and press its target slot to collect (or swap into) it. Cost: travel time/exposure to reach it. Benefit: acquires a strategic resource. Objective: build up item inventory for future use.
- *Reposition-for-safety*: move to a room corner or off a turret's detection box, or behind a floor/bridge chokepoint. Cost: temporary loss of offensive tempo. Benefit: avoids turret pulse damage or enemy line of sight while still remaining tactically present. Objective: survive while retaining map presence.
- *Idle-regen*: stop attacking and moving aggressively to let `healCooldown`/`attackCooldown` elapse and regenerate HP/ammo. Cost: no offensive progress during this time. Benefit: restores combat readiness. Objective: sustain long-term combat capacity.

**3. How to apply a decision** (execution conditions/considerations):
- *Advance-and-fight*: set `target` (fixed/delta/auto) toward the enemy; prefer `auto` when multiple enemies are present and re-targeting the nearest is desirable; monitor `attackMunitions` and release before it reaches 0 (§14.6).
- *Retreat/disengage*: set `target = null` immediately (do not simply stop moving toward the enemy while still holding attack, since that keeps draining ammo); move away using the movement model's fast reverse-deceleration if changing direction abruptly.
- *Capture-push*: commit sustained standard-attack fire at a specific turret; for a neutral turret, verify no ally is simultaneously fighting for the *other* team's activation direction against the same turret (would be impossible in a 2-team game, but coordinate with allies to concentrate fire so the tug-of-war resolves quickly rather than trading evenly with a lone contesting enemy); for a captured enemy turret, expect its own defensive pulse and plan HP/positioning (corners) accordingly.
- *Defend-turret*: position within the room but ideally near the entrance/bridge chokepoint rather than deep inside the turret's own kill radius, to intercept attackers before they reach point-blank range; use Traps at the chokepoint for passive area denial.
- *Farm-turret*: only initiate while the team's total turret count is low enough that `cost` (§2.7 table) is an acceptable pause duration, and ideally with an escort present or the location reasonably safe from immediate incursion; be aware the final threshold-crossing shot costs real turret HP.
- *Throw-defensive-item*: arm the appropriate slot (§5.2) and confirm the throw with an aimed target; Wall should be dropped at the player's own feet in a position that will not obstruct planned outgoing fire; Sliders should be aimed to travel through the anticipated line of enemy fire or ally position.
- *Throw-offensive-item*: aim Balloon well clear of any turret unless an enemy is expected in range simultaneously; aim/place Traps at choke points (bridges, turret room entrances) where enemy players are expected to pass, taking advantage of the 3-use chain if starting from TrapIII.
- *Deploy-support-entity*: throw Tank/Booster with any aim (their subsequent path is automatic, not directly steerable) from a position from which they can reach their automatic target (nearest enemy turret for Tank, nearest friendly turret for Booster) without being immediately destroyed; ideally provide covering fire during their approach.
- *Use-Star*: trigger when a decisive, time-limited action is most valuable — e.g., an uncontested push into heavy defensive fire, an emergency full-safety retreat while still healing, or a safe window to farm/capture without any damage risk.
- *Loot/pickup-item*: path toward the item, then press its target inventory slot's key while standing within pickup range (100 units); if that slot already holds something desired, choose a different (possibly empty) slot to avoid an unwanted swap.
- *Reposition-for-safety*: move beyond `TURRET_RADIUS` (1440) from an enemy/contested turret's center while still remaining inside the room (to continue baiting/consuming its cooldown) or leave the room's `ROOM_SIZE` box entirely to stop triggering it altogether.
- *Idle-regen*: hold `target = null`, remain out of enemy fire range, and wait out `HEAL_COOLDOWN` (3s) and `ATTACK_COOLDOWN` (2s) before HP and ammo begin regenerating.

**4. How to choose and change the current decision:**
- Continuously re-evaluate every frame/tick against the current state: own HP fraction, own `attackMunitions`/`attackFullyReloading` state, held items, nearby enemy/ally presence and their states, and the map-wide turret ownership/vulnerability picture (available via the minimap information channel, §11).
- **Prioritize survival triggers**: if HP is critically low and no invincibility/Star is active, prefer *Retreat/disengage*, *Reposition-for-safety*, or *Idle-regen* over any offensive decision, since death imposes a fixed 2.0s total incapacitation plus a full trip back to the fixed home spawn (§1.3, §4.5) — a significant tempo loss, especially far from the front line.
- **Prioritize resource-lockout avoidance**: if `attackMunitions` is nearly exhausted mid-fight and disengaging is viable, switch to *Retreat/disengage* rather than continuing to *Advance-and-fight*, to avoid the long forced reload (§8.4, §14.6).
- **Escalate toward the objective when safe**: absent an immediate survival or resource concern, prefer whichever of *Capture-push*/*Defend-turret*/*Farm-turret* most directly improves the team's turret count or protects it, using the minimap to identify the most contested or most vulnerable (enemy farming-paused, or freshly-captured within its 5s window) turret as the highest-value target.
- **Switch to Farm-turret only opportunistically**: re-evaluate the team's current turret count before farming (§2.7 table) each time the opportunity arises, since the same action's cost changes dynamically as the match's territorial balance shifts; abandon a farming attempt (switch to *Defend-turret*) if an enemy incursion is detected nearby before the pause completes.
- **Reserve Star deliberately**: do not spend a held Star reactively at the first sign of danger; hold it as a state variable and switch to *Use-Star* specifically when a *Capture-push*, *Farm-turret*, or *Retreat/disengage* decision would otherwise carry meaningfully higher risk, since its 10s window is long enough to convert almost any single engagement.
- **Terminate a decision when its exit condition is met**: e.g., *Capture-push* ends when the target turret's `team` changes to the pushing side (success) or when HP/ammo state forces a *Retreat* (failure/interruption); *Farm-turret* ends when `itemsToSpawn` resolves or when interrupted by enemy contact; *Idle-regen* ends once HP/ammo are sufficiently restored or a new threat/opportunity appears, at which point the loop re-selects a new decision from step 1 of the core loop (§14.1).
