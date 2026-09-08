# Multiplayer Synchronization System

## 1. Overview

The multiplayer server uses a **server-authoritative, event-driven synchronization model**.

The core idea is:

* Each player has a **client simulation clock**.
* The server keeps one authoritative game state.
* Every client sends its current simulation timestamp together with its inputs.
* The server advances the authoritative simulation only when the player currently owning the oldest timestamp sends an update.
* Inputs from all players are stored in a globally timestamp-sorted list.
* The server simulates the game from the previous authoritative timestamp to the newest timestamp.
* The resulting state is sent back to clients together with the inputs that are still pending.

The important invariant is:

> `latestData` represents the game state at `players[latestUser].lastClientDate`.

The server therefore does **not** simply simulate continuously according to server wall-clock time. It advances the authoritative state according to the progression of the clients' simulation timestamps.

---

# 2. Player Clocks

Each `Player` has two timestamps:

```ts
lastClientDate
lastServerDate
```

### `lastClientDate`

This represents the most recent game timestamp reported by that player.

It belongs to the **client simulation timeline**, not the server's `performance.now()` timeline.

When a client sends:

```ts
{
    timestamp: data.timestamp,
    inputs: ...
}
```

the server eventually executes:

```ts
this.players[playerIdx].lastClientDate = data.timestamp;
```

for the player whose update is being processed.

### `lastServerDate`

This is used exclusively to implement a minimum delay between messages from the same player.

It is updated using:

```ts
performance.now()
```

and therefore belongs to the server's real-time clock.

It is **not part of game-state synchronization**.

---

# 3. Runtime Ping / Message Rate Limiting

When a message arrives, the server computes:

```ts
const pingCooldown =
    MIN_PING - this.players[playerIdx].getRuntimePing();
```

`getRuntimePing()` measures the amount of real server time elapsed since the player's previous message.

If the player sent the message too quickly:

```ts
if (pingCooldown > 0) {
    await sleepTime(pingCooldown);
    this.players[playerIdx].lastServerDate = performance.now();
}
```

the server waits until at least `MIN_PING` milliseconds have elapsed.

This mechanism prevents a client from advancing the synchronization mechanism arbitrarily quickly by sending a very large number of packets.

It is a **rate limiter**, not a synchronization mechanism itself.

---

# 4. Global Input Queue

All received inputs are inserted into:

```ts
private readonly inputs = new Array<Fields>();
```

Each input is augmented with its originating player:

```ts
data.inputs.map((i: any) => ({
    ...i,
    player: playerIdx
}))
```

The resulting inputs are inserted using:

```ts
pushSortedArrays(
    this.inputs,
    ...,
    compareInputs
);
```

where:

```ts
function compareInputs(a: Fields, b: Fields) {
    return a.timestamp - b.timestamp;
}
```

Therefore:

> `this.inputs` is always sorted chronologically by input timestamp.

Conceptually:

```text
inputs
───────────────────────────────────────────────
t=100 player=0
t=105 player=1
t=110 player=0
t=115 player=1
t=120 player=0
───────────────────────────────────────────────
                     ↑
               chronological
```

This allows the game simulation to process inputs in temporal order regardless of which client sent them first over the network.

---

# 5. The `latestUser`

The most important synchronization mechanism is:

```ts
private latestUser: number = 0;
```

`latestUser` identifies the player whose `lastClientDate` is currently the **oldest / minimum client timestamp**.

It is recomputed using:

```ts
this.latestUser = minBy(this.players, getLastDate);
```

with:

```ts
function getLastDate(player: Player) {
    return player.lastClientDate;
}
```

Therefore:

```text
latestUser = player with the smallest lastClientDate
```

For example:

```text
Player 0: lastClientDate = 1000
Player 1: lastClientDate = 1050
Player 2: lastClientDate = 1020

latestUser = 0
```

This means the authoritative state is considered synchronized up to timestamp:

```text
1000
```

The server waits for the lagging player to provide a newer timestamp before advancing the authoritative state beyond that point.

---

# 6. Why the Minimum Timestamp Is Used

Suppose there are three players:

```text
Player 0 → 1000
Player 1 → 1100
Player 2 → 1050
```

The server cannot safely consider the game authoritative at `1100`, because Player 0 may still provide an input occurring at:

```text
1000 < input.timestamp < 1100
```

If the server simulated beyond that point before receiving Player 0's input, that input would arrive too late and would require rewinding the simulation.

Instead, the server considers:

```text
min(1000, 1100, 1050) = 1000
```

as the safe synchronization frontier.

Once Player 0 reports:

```text
Player 0 → 1080
```

the frontier becomes:

```text
min(1080, 1100, 1050) = 1050
```

The authoritative simulation can therefore advance from:

```text
1000 → 1050
```

without requiring rollback for inputs from players that have already reached at least `1050`.

---

# 7. Advancing the Authoritative State

A player's message only advances the game state if that player is currently the `latestUser`:

```ts
if (this.latestUser === playerIdx) {
    ...
}
```

The process is:

### Step 1 — Save the previous synchronization timestamp

```ts
const lastDate =
    this.players[playerIdx].lastClientDate;
```

### Step 2 — Update that player's timestamp

```ts
this.players[playerIdx].lastClientDate =
    data.timestamp;
```

### Step 3 — Find the new oldest player

```ts
this.latestUser =
    minBy(this.players, getLastDate);
```

### Step 4 — Obtain the new synchronization frontier

```ts
const nextDate =
    this.players[this.latestUser].lastClientDate;
```

The server now has:

```text
previous authoritative timestamp = lastDate
new authoritative timestamp       = nextDate
```

and simulates:

```ts
gamemode.emulate(
    lastDate,
    nextDate,
    this.inputs,
    preprocess,
    ...
);
```

Conceptually:

```text
                  simulation interval
             ┌──────────────────────────┐
             │                          │
             ▼                          ▼
           lastDate                  nextDate
             │                          │
             └────── gamemode.emulate ──┘
```

---

# 8. Important Synchronization Invariant

After the simulation:

```ts
this.latestData = this.gamemode.save();
```

The following relationship should hold:

```text
latestData
    =
game state at
players[latestUser].lastClientDate
```

or more explicitly:

```text
latestData ≈ State(t = min(player.lastClientDate))
```

This is the central invariant of the synchronization system.

---

# 9. Processing Inputs During Emulation

The game mode receives the complete pending input list:

```ts
this.inputs as EmulationInput[]
```

Because the list is sorted by timestamp, `gamemode.emulate()` can process inputs chronologically.

For example:

```text
inputs:

t=100  player 0 → move right
t=105  player 1 → jump
t=108  player 0 → throw
t=112  player 1 → move left
```

When simulating:

```ts
emulate(100, 112, inputs)
```

the game mode applies each input at the appropriate point in time.

The synchronization system therefore does not require packets to arrive in chronological network order.

Network arrival order:

```text
player 1 t=105
player 0 t=100
player 1 t=112
player 0 t=108
```

can still produce the correct simulation order:

```text
t=100
t=105
t=108
t=112
```

because inputs are inserted into a sorted queue.

---

# 10. Removing Processed Inputs

After the authoritative simulation reaches `nextDate`, inputs strictly before that timestamp are no longer needed:

```ts
let i = 0;

while (
    i < this.inputs.length &&
    this.inputs[i].timestamp < nextDate
) {
    i++;
}

this.inputs.splice(0, i);
```

Therefore:

```text
inputs.timestamp < nextDate
```

are considered processed.

Inputs at exactly:

```text
timestamp === nextDate
```

are retained.

This is important because the processing interval effectively treats the synchronization boundary as inclusive on the future side.

---

# 11. Inputs From the Current Packet

There is an important detail in the implementation.

The incoming packet's inputs are inserted into the global queue **before** simulation:

```ts
pushSortedArrays(
    this.inputs,
    data.inputs.map(...),
    compareInputs
);
```

However, when the current player is the `latestUser`, the packet's inputs are also copied into `tempInputs` after the simulation:

```ts
pushSortedArrays(
    tempInputs,
    data.inputs.map(...),
    compareInputs
);
```

The purpose of `tempInputs` is related to the special bot simulation path described below.

The global `inputs` queue therefore represents pending inputs that may need to be replayed by subsequent simulation steps.

---

# 12. Bots

Bots require special handling because they do not have an independent network client sending timestamps.

There are two different bot synchronization paths.

## Multiple Human Players

When there is more than one human player:

```ts
if (this.players.length !== 1) {
    ...
}
```

the server runs bots using:

```ts
runBots()
```

The bots have their own simulation timestamp:

```ts
private botsInstant: number = 0;
```

At room start:

```ts
this.botsInstant = now;
```

where `now` is `performance.now()`.

The bot simulation therefore progresses independently toward the current server time.

---

# 13. Bot Catch-Up

Before generating new bot inputs:

```ts
const lastClientDate =
    this.players[this.latestUser].lastClientDate;
```

If the human synchronization frontier is behind the bot simulation:

```ts
if (lastClientDate < this.botsInstant) {
    this.gamemode.emulate(
        lastClientDate,
        this.botsInstant,
        this.inputs
    );
}
```

the game is temporarily simulated forward so that the bot simulation starts from the correct temporal position.

Then:

```ts
this.botsInstant = this.gamemode.emulate(
    this.botsInstant,
    () => performance.now(),
    this.inputs,
    timestamp => this.preprocessBots(...)
);
```

advances the bot simulation toward the current server time.

The bot inputs generated during this process are added to the global input queue.

---

# 14. Temporary Bot Simulation State

Running bots must not permanently modify the authoritative state.

The sequence is:

```text
1. Save authoritative state
       ↓
2. Move simulation forward
       ↓
3. Run bots
       ↓
4. Generate bot inputs
       ↓
5. Restore authoritative state
```

The restoration is performed with:

```ts
this.gamemode.load(this.latestData);
```

Thus:

```text
latestData
    ↓
authoritative state

temporary simulation
    ↓
bot prediction / execution

load(latestData)
    ↓
authoritative state restored
```

The bot simulation is therefore used primarily to determine **what inputs the bots should generate**, rather than to directly mutate the authoritative game state.

---

# 15. Single-Player Rooms

A special path exists when:

```ts
this.players.length === 1
```

In that case, there is only one human synchronization clock.

The comment explains the reason:

> If there is only one player, `latestData` belongs only to this unique player, so bots must be processed at every step.

Instead of `runBots()`, bot inputs are generated during the authoritative `emulate()` call:

```ts
const preprocess =
    (timestamp: number) =>
        this.preprocessBots(tempInputs, timestamp);
```

and passed directly to:

```ts
this.gamemode.emulate(
    lastDate,
    nextDate,
    this.inputs,
    preprocess,
    ...
);
```

This makes bot input generation part of the authoritative simulation itself.

---

# 16. Server Message Generation

After synchronization advances, the server generates a `ServerMessage`:

```ts
ServerMessage.encode({
    timestamp:
        this.players[this.latestUser].lastClientDate,

    state:
        this.latestData,

    inputs:
        this.inputs.map(data => ({
            data,
            player: data.player
        }))
}).finish()
```

The message contains three important pieces of information.

### `timestamp`

The current authoritative synchronization timestamp:

```text
min(player.lastClientDate)
```

### `state`

The serialized authoritative game state:

```text
latestData
```

### `inputs`

Inputs that are still pending after the authoritative state timestamp.

This lets clients reconstruct or advance their local simulation consistently.

---

# 17. Synchronization Timeline Example

Consider two players:

```text
Player A
Player B
```

Initially:

```text
A = 0
B = 0

latestUser = A
```

A sends an update:

```text
A = 20
B = 0
```

The minimum remains:

```text
min(20, 0) = 0
```

so the authoritative frontier cannot advance.

Then B sends:

```text
B = 15
```

Now:

```text
A = 20
B = 15

latestUser = B
```

The server advances:

```text
0 → 15
```

and saves:

```text
latestData = State(15)
```

Now:

```text
A = 20
B = 15
```

The server waits for B to progress further.

Suppose B sends:

```text
B = 25
```

Now:

```text
A = 20
B = 25

latestUser = A
```

The authoritative state advances:

```text
15 → 20
```

The process repeats.

The synchronization frontier therefore behaves like:

```text
             A: ────────20────────────30────
                  ▲
                  │
             B: ───15────────25────────────
                  ▲
                  │
authoritative: ───15──────20──────30────────
```

The authoritative state follows the **slowest client's reported simulation time**.

---

# 18. Why This Avoids Rollback

The system deliberately advances only to:

```ts
min(player.lastClientDate)
```

This means every human player has already reported that it has simulated at least up to that timestamp.

Consequently, an input from a normally behaving player should not suddenly appear with a timestamp earlier than the authoritative frontier.

This is a form of **lockstep / conservative temporal synchronization**:

```text
Do not simulate beyond the time for which every participant
has provided sufficient information.
```

It trades latency for determinism and avoids the complexity of state rollback.

---

# 19. Important Distinction: Client Time vs Server Time

There are two fundamentally different clocks.

## Client/Game Clock

Used for:

```ts
lastClientDate
data.timestamp
input.timestamp
gamemode.emulate(start, finish)
```

This clock determines the simulated game timeline.

## Server Wall Clock

Used for:

```ts
performance.now()
lastServerDate
botsInstant
MIN_PING
sleepTime(...)
```

This clock determines real elapsed time on the server.

They must not be interpreted as the same timeline.

For example:

```text
performance.now() = 15342 ms
client timestamp  = 8200 ms
```

does not mean there is an error. They belong to different clock domains.

---

# 20. Room Initialization

At room start:

```ts
const now = performance.now();

for (const p of this.players) {
    p.init(now);
}
```

Therefore every player initially has:

```text
lastClientDate = now
lastServerDate = now
```

The initial authoritative state is created before this:

```ts
this.gamemode.init();

this.latestData =
    this.gamemode.save();
```

The initial `ServerMessage` uses:

```ts
timestamp:
    this.players[this.latestUser].lastClientDate
```

and contains the initial serialized state.

Thus clients begin from a common initial state and timestamp.

---

# 21. Complete Message Processing Flow

For every client packet, the server conceptually executes:

```text
                     Client packet
                          │
                          ▼
                  Decode protobuf
                          │
                          ▼
                  Extract timestamp
                  and client inputs
                          │
                          ▼
              Insert inputs chronologically
                          │
                          ▼
                 Apply MIN_PING limit
                          │
                          ▼
             Is player == latestUser?
                    /            \
                  no              yes
                  │                │
                  │                ▼
                  │       Update player's timestamp
                  │                │
                  │                ▼
                  │       Find minimum timestamp
                  │                │
                  │                ▼
                  │       Simulate last → next
                  │                │
                  │                ▼
                  │       Save authoritative state
                  │                │
                  │                ▼
                  │       Remove processed inputs
                  │                │
                  └───────┬────────┘
                          │
                          ▼
                     Run bots
                          │
                          ▼
                  Produce ServerMessage
                          │
                          ▼
                    Return to client
```

---

# 22. Key State Variables

An AI maintaining or modifying this system should understand the following variables precisely.

| Variable                    | Meaning                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `players[i].lastClientDate` | Latest simulation timestamp acknowledged/reported by human player `i` |
| `players[i].lastServerDate` | Server wall-clock timestamp used for message rate limiting            |
| `latestUser`                | Human player with the smallest `lastClientDate`                       |
| `latestData`                | Authoritative serialized game state at the synchronization frontier   |
| `inputs`                    | Globally timestamp-sorted pending inputs                              |
| `botsInstant`               | Server-time position of the bot simulation                            |
| `MIN_PING`                  | Minimum real-time interval between accepted messages from one player  |
| `finished`                  | Whether the room has already finished                                 |

---

# 23. Core Invariants

When modifying this system, preserve these invariants.

### Invariant 1 — Input ordering

```text
inputs[i].timestamp <= inputs[i + 1].timestamp
```

The input queue must remain sorted.

### Invariant 2 — Authoritative timestamp

```text
latestData
=
game state at
min(players[*].lastClientDate)
```

### Invariant 3 — `latestUser`

```text
latestUser =
argmin(player.lastClientDate)
```

### Invariant 4 — Processed inputs

After advancing to `nextDate`:

```text
all inputs with timestamp < nextDate
```

can be removed from the pending queue.

### Invariant 5 — Bot isolation

When bots are simulated outside the authoritative path:

```text
gamemode state after runBots()
=
gamemode state before runBots()
```

because the authoritative state is restored with:

```ts
gamemode.load(latestData)
```

### Invariant 6 — Server/client clocks

Never compare or substitute:

```text
performance.now()
```

with:

```text
client timestamp
```

unless an explicit clock synchronization transformation is intended.

---

# 24. Conceptual Model

The entire synchronization algorithm can be reduced to the following model:

```text
                    Human clients
                ┌──────┬──────┬──────┐
                │      │      │      │
                ▼      ▼      ▼      ▼
              time   time   time   time
                │      │      │      │
                └──────┴──────┴──────┘
                           │
                           ▼
                     MINIMUM TIME
                           │
                           ▼
                Synchronization frontier
                           │
                           ▼
                   Authoritative state
                           │
                           ▼
                    Sorted input queue
                           │
                           ▼
                   gamemode.emulate()
                           │
                           ▼
                     latestData
                           │
                           ▼
                    ServerMessage
```

The essential principle is:

> **The server advances the authoritative simulation only up to the minimum simulation timestamp reported by all human players, processing all known inputs in chronological order.**

This provides a conservative synchronization mechanism that avoids rollback by ensuring that the authoritative simulation does not move ahead of the least-progressed participant.

