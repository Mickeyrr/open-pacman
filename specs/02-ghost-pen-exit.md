# SPEC 02 — Ghost pen exit

> **Status:** Aprobado
> **Depends on:** SPEC 01
> **Date:** 2026-10-28
> **Objective:** Make every released ghost leave the pen through the door with a forced upward route and prevent it from re-entering once outside.

## Why this spec exists

SPEC 01 placed the four ghosts inside the pen and released them by timer, but the release logic only makes one `up` attempt. From the first interior cell the normal AI takes over, and the Manhattan tie between the door and a side cell is resolved against the door, so ghosts bounce inside the pen indefinitely. There is also no rule that stops the AI from walking back into the pen through the door.

## Scope

**In:**

- Replace the `inHouse` boolean with an explicit per-ghost house state: `waiting`, `exiting`, `out`.
- Force `up` movement while `exiting`, from the start cell to the first row above the pen.
- Apply the AI again only when the ghost is `out`.
- Make the door one-way for ghosts: it can be crossed only from inside the pen upwards, never from outside downwards and never horizontally.
- Keep the existing start cells (`GHOST_STARTS`) and release timing (`i * 1500` ms from game start).
- Reset the house state on `resetPositions()` (life lost), so ghosts wait and exit again.
- Keep Pac-Man blocked by the door and keep collision, scoring, win and lose rules unchanged.

**Out of scope (for future specs):**

- Bouncing or idle animation for ghosts waiting inside the pen.
- Forced re-entry of eaten ghosts (no eaten/eyes mode exists yet).
- Changes to release timers, release order or per-ghost speeds.
- Changes to `GHOST_STARTS` coordinates or to the maze layout.
- Power-ups, frightened mode and respawn animations.

## Data model

No new top-level structures. All changes are inside the existing ghost runtime object in `src/js/game.js`.

**Per-ghost state (replaces `inHouse`):**

```js
{
  houseState: 'waiting', // 'waiting' | 'exiting' | 'out'
  releaseTime: 0,        // ms from game start, unchanged: i * 1500
  dir: 'up',
}
```

Rules:

- `waiting`: the ghost stands still in its start cell until `elapsedTime >= releaseTime`.
- `exiting`: the ghost moves only upwards until it reaches `y <= PEN_EXIT_ROW`.
- `out`: the ghost uses `decideGhost()` as today.

**Pen geometry constants (new, `src/js/game.js`):**

```js
const PEN = { xMin: 11, xMax: 16, yMin: 13, yMax: 15 };
const PEN_DOOR_ROW = 12;
const PEN_EXIT_ROW = 11; // first row outside the pen
```

`PEN` matches the interior of the maze at rows 13–15, columns 11–16.

## Implementation plan

1. **Add pen constants** in `src/js/game.js` (`PEN`, `PEN_DOOR_ROW`, `PEN_EXIT_ROW`) next to `GHOST_STARTS`-derived values. Manual test: game still loads and runs unchanged.
2. **Introduce `houseState`**: replace `inHouse: true` in `createGame()` with `houseState: 'waiting'`; update `getTarget()` and `resetPositions()` to use it. Manual test: ghosts still wait and still fail to leave (current behaviour preserved, no regressions elsewhere).
3. **One-way door for ghosts**: update `canMove()` (or `isWall()`) so a ghost may enter a door cell (`3`) only when moving up from a pen cell (`PEN` interior). Any other door traversal by a ghost is blocked; Pac-Man keeps being blocked by the door.
4. **Forced exit**: update `moveGhost()`:
   - `waiting` + `elapsedTime < releaseTime` → no movement.
   - `waiting` + time reached → `houseState = 'exiting'`, `dir = 'up'`.
   - `exiting` → force `dir = 'up'`; when aligned at `y <= PEN_EXIT_ROW`, set `houseState = 'out'` and let `decideGhost()` run from that cell.
   - `out` → unchanged AI path.
   - If `up` is blocked while `exiting` (defensive guard), set `houseState = 'out'` to avoid a deadlock.
5. **Verify in browser**: open `src/index.html`, confirm each ghost exits through the door and never returns to the pen.

## Acceptance criteria

- [ ] The game loads with no console errors after the change.
- [ ] All four ghosts start inside the pen and stay still until their release time.
- [ ] Each released ghost exits the pen through the door moving only upwards.
- [ ] Within 2 seconds of its release time, every ghost has `y <= 11` (outside the pen).
- [ ] No ghost is inside a pen cell (`x` in 11–16, `y` in 13–15) more than 5 seconds after game start.
- [ ] An exited ghost never occupies a pen cell again during the same life.
- [ ] Pac-Man still cannot cross the door.
- [ ] Losing a life returns all four ghosts to their start cells inside the pen, and they exit again after their timers.
- [ ] Scatter/chase targeting, collisions, scoring, `GANASTE` and `PERDISTE` keep working as in SPEC 01.

## Decisions taken and discarded

- **Yes:** forced upward route through the door. No teleport, so the exit is visually coherent and keeps the door meaningful.
- **Yes:** explicit `houseState` with three values instead of `inHouse` plus a second boolean. One field, no impossible combinations.
- **Yes:** one-way door enforced in the movement rule (`canMove`/`isWall`). It fixes the root cause (AI re-entry) instead of biasing targets.
- **Yes:** keep `GHOST_STARTS` and `releaseTime` from SPEC 01. The bug is in the exit logic, not in the spawn layout.
- **Yes:** all changes live in `src/js/game.js`. No new files and no maze changes.
- **No:** teleporting ghosts to the map on release. It would hide the bug instead of fixing the exit, and the jump is visible.
- **No:** bouncing animation inside the pen. Cosmetic, deferred.
- **No:** pathfinding or door-penalty in the target calculation. Forced exit plus a one-way door is simpler and enough.

## Risks

| Risk | Mitigation |
| --- | --- |
| A ghost released while another is still on the same column could overlap | Release times are 1.5 s apart and `GHOST_SPEED` covers about 9 cells in that time; pen exit takes 4 cells. If overlap is observed, add a cell-occupancy check before leaving (future spec). |
| `GHOST_STARTS` changed later to a column outside the door (13/14) | Forced `up` would hit a wall; the defensive guard switches the ghost to `out` instead of deadlocking. |
| Forgetting to reset `houseState` on life loss | Covered by the plan step and by an explicit acceptance criterion. |

## What is **not** in this spec

- Eaten-ghost mode and eyes returning to the pen.
- Idle/bounce animation inside the pen.
- New release timers, per-ghost speeds or difficulty tuning.
- Maze or `GHOST_STARTS` modifications.
- Power-ups, sounds or UI changes.

Each of those, if it lands, goes in its own spec.
