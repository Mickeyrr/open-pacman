# SPEC 04 — Eaten ghosts return to the pen

> **Status:** Aprobado
> **Depends on:** SPEC 01, SPEC 02, SPEC 03
> **Date:** 2026-10-28
> **Objective:** Fix the grid desynchronization that makes eaten ghosts fly out of the maze, so every eaten ghost returns to its own start cell in the pen, waits 1000 ms and exits again.

## Why this spec exists

SPEC 03 shipped `houseState: 'eaten'` and an eyes path back to the pen, but the return fails in practice because of a movement-phase bug.

- A frightened ghost moves at `0.05` cells/frame, so when Pac-Man eats it mid-cell its coordinates are odd multiples of `0.05` (for example `13.15`).
- On being eaten, `g.speed` changes to `0.1`. From `13.15`, adding `0.1` never lands on an integer.
- `moveGhost()` only picks a direction and validates walls when `aligned( x ) && aligned( y )`. A desynchronized ghost never aligns again, ignores walls and leaves the grid. A simulation of the current code ends with the eyes at `y = -295` and `houseState` still `eaten`.
- The same defect hits a normal ghost when frightened mode ends mid-cell: `endFrightened()` restores `0.1` while the ghost is at an odd multiple of `0.05`. The ghost then crosses walls until it leaves the map.

The fix must be at the movement layer, not in the eyes logic: ghosts must always reach the next cell center exactly, regardless of the speed in effect.

## Scope

**In:**

- New `advanceToNextCell( actor, speed )` helper in `src/js/game.js`: moves the actor along its current direction and lands exactly on the next integer center, never overshooting it.
- Use that helper for every ghost movement, so `0.05` and `0.1` speeds can be mixed mid-cell without desynchronizing.
- New per-ghost `home` cell taken from `GHOST_STARTS` in `createGame()`.
- `decideEatenGhost()` targets `g.home` instead of the shared `PEN_TARGET`.
- An eaten ghost becomes `waiting` only when it is aligned on its own `home` cell, not on the first pen cell it touches.
- Keep the existing respawn sequence: wait `1000` ms, then forced `up` exit through the door.
- Keep eyes at `GHOST_SPEED` (`0.1` cells/frame) and normal ghost rendering (`houseState === 'eaten'` draws eyes only).
- Remove `PEN_TARGET` once nothing uses it.

**Out of scope (for future specs):**

- Frightened-mode behavior, scoring chain, pellet positions or durations.
- Faster eyes, respawn animations or sound effects.
- Ghost-ghost collision, occupancy reservation inside the pen or spawn-blocking rules.
- Changes to `PEN`, `PEN_DOOR_ROW`, `PEN_EXIT_ROW`, release timers (`i * 1500`) or `EATEN_RELEASE_DELAY`.
- Refactoring Pac-Man movement or applying the new helper to Pac-Man.
- Automated test framework.

## Data model

No new top-level structures. One field is added to the existing ghost runtime object, and one constant becomes unused.

**`src/js/game.js` — per-ghost state in `createGame()`:**

```js
{
  home: { x: g.x, y: g.y }, // celda de GHOST_STARTS; destino cuando el fantasma es comido
  houseState: 'waiting',    // 'waiting' | 'exiting' | 'out' | 'eaten'
  // x, y, dir, speed, kind, color, scatter, frightened, releaseTime unchanged
}
```

Rules:

- `home` is immutable for the whole game and equals the ghost's `GHOST_STARTS` cell.
- `waiting`: the ghost stands on its `home` cell (initial spawn or after being eaten).
- `eaten`: BFS goal is `home`; the ghost keeps `aligned()` decision points and reaches the pen through the door.
- `home` is not reset in `resetPositions()`: `x` and `y` are already restored from `GHOST_STARTS[ i ]`.

**`src/js/game.js` — movement helper (contract, not full code):**

```js
// Avanza hacia el siguiente centro de celda sin pasarlo, para que cualquier
// velocidad termine siempre alineada a la rejilla.
function advanceToNextCell( actor, speed )
```

- Next center: `Math.ceil( pos + 1e-9 )` when moving right/down, `Math.floor( pos - 1e-9 )` when moving left/up, on the movement axis only.
- `step = Math.min( speed, distanceToNextCenter )`.
- When `distanceToNextCenter <= speed`, assign the integer center exactly instead of adding, so floats do not accumulate.
- `actor` is any object with `x`, `y` and `dir`; the function does not wrap the tunnel, `wrapTunnel()` still runs afterwards.

**`src/js/game.js` — removed constant:**

```js
const PEN_TARGET = { x: 13.5, y: 13 }; // eliminado
```

## Implementation plan

1. **Add the movement helper** in `src/js/game.js` with the contract above. Manual test: open `src/index.html`, all four ghosts still exit the pen at `1.5` s intervals and normal chase feels unchanged.
2. **Move ghosts with the helper**: replace the `g.x += d.x * speed; g.y += d.y * speed;` block at the end of `moveGhost()` with `advanceToNextCell( g, speed )` plus the existing `wrapTunnel( g, width )`. Manual test: eat a power pellet and confirm frightened ghosts still move at half speed and align at intersections.
3. **Add `home`** in `createGame()` for every ghost. Manual test: the game still loads and the ghosts spawn in the same cells.
4. **Retarget the eyes**: change the BFS goal in `decideEatenGhost()` from `PEN_TARGET` to `g.home`, and delete `PEN_TARGET`. Manual test: eat a ghost far from the pen and watch the eyes head for the door instead of a corner.
5. **Detect arrival at home**: in the `houseState === 'eaten'` branch of `moveGhost()`, replace the `isPenCell()` transition with a check that the ghost is aligned on `g.home`; on arrival set `houseState = 'waiting'`, `dir = 'up'`, `speed = GHOST_SPEED`, `frightened = false` and `releaseTime = game.elapsedTime + EATEN_RELEASE_DELAY`. Manual test: an eaten ghost stops on its own start cell, waits one second and leaves through the door.
6. **Verify the frightened-mode exit**: eat a pellet and let it expire while ghosts are between cells. Manual test: ghosts finish the current cell at the slow speed, then resume normal speed and never cross a wall.
7. **Full browser pass**: eat one ghost, eat several ghosts with one pellet, lose a life during a return, win and restart. Manual test: every acceptance criterion below passes.

## Acceptance criteria

- [ ] `src/index.html` opens with no console errors.
- [ ] Each ghost object has a `home` equal to its `GHOST_STARTS` cell.
- [ ] An eaten ghost is drawn as eyes and keeps moving until it reaches its own `home` cell.
- [ ] An eaten ghost reaches its `home` cell within 10 seconds of being eaten from any maze corner.
- [ ] On arrival, the ghost's `x` and `y` are integers equal to `home.x` and `home.y`.
- [ ] The ghost stays on `home` for 1000 ms and then exits through the door moving only upwards.
- [ ] After exiting, its `y` is `<= 11` and it behaves as a normal ghost, even if the pellet that ate it is still active.
- [ ] An eaten ghost never crosses a wall and never leaves the grid (`0 <= x <= 27`, `0 <= y <= 30`, tunnel row aside).
- [ ] When frightened mode ends with a ghost mid-cell, that ghost continues to the next center, turns there, and never crosses a wall.
- [ ] Ghosts keep their existing cadence: normal movement at `0.1`, frightened movement at `0.05`, no skipped or doubled cells.
- [ ] Eating several ghosts with one pellet still awards `200/400/800/1600` and all of them return to the pen.
- [ ] Losing a life while eyes are returning resets all four ghosts to `GHOST_STARTS`, cancels `eaten` and restores the release timers.
- [ ] The door still blocks Pac-Man and still lets ghosts through only upwards, except returning eyes.
- [ ] `GANASTE`, `PERDISTE`, dot scoring, pellet scoring and tunnel wrapping behave exactly as in SPEC 03.
- [ ] Restarting from the overlay rebuilds the ghost array with `home`, score, lives and pellets in their initial state.

## Decisions taken and discarded

- **Yes:** fix the movement phase with `advanceToNextCell()`. It removes the root cause for both the eaten-ghost bug and the frightened-mode-exit bug, with no visible jump.
- **No:** snapping the ghost to the nearest integer when it is eaten. It masks only the eaten case, can jump up to half a cell and leaves the frightened-mode exit broken.
- **No:** moving eyes at `0.05` to stay on the same lattice. It fixes the eaten case but not the speed change when frightened mode ends, and makes the return needlessly slow.
- **No:** snapping every ghost whenever its speed changes. Same jump problem and scattered special cases instead of one movement invariant.
- **Yes:** eyes return at `GHOST_SPEED` (`0.1`). User decision; keeps the current tempo.
- **Yes:** each ghost returns to its own start cell. User decision; it matches "su posición inicial" and reuses `GHOST_STARTS`.
- **No:** keeping the shared `PEN_TARGET` at `(13,13)`. Two ghosts would stack under the door and it is not the initial position.
- **Yes:** reuse the existing `houseState` machine. No new state and no new boolean.
- **Yes:** keep the 1000 ms wait. User decision; matches SPEC 03 and reads as a respawn.
- **No:** applying `advanceToNextCell()` to Pac-Man. His speed is fixed at `0.125` from an aligned start and never changes mid-cell.
- **No:** ghost-ghost collision or pen reservation. Separate concern; returning ghosts may briefly overlap waiting ones.

## Risks

| Risk | Mitigation |
| --- | --- |
| The clamp changes normal ghost cadence | `step` is still `speed` while the distance to the next center is larger; only the final step is shortened, and it lands on the same frame as before. |
| BFS goal inside the pen needs a valid door crossing | `canMove(..., 'eaten')` already allows the door in any direction; the path to `home` uses rows 12–15 through columns 13–14. |
| A returning ghost passes through a waiting ghost | Ghosts never collided before; the overlap lasts a few frames while the eyes cross the pen. If it becomes a problem, it gets its own spec. |
| Float drift after many additions | The last step of every cell assigns the exact integer center; `aligned()` keeps its existing `1e-3` tolerance. |
| `home` is missing after a future reset | `createGame()` is the only constructor of ghost objects and `resetPositions()` restores positions from `GHOST_STARTS`; the new field is static. |
| A desynchronized ghost already exists when the fix lands | The helper lands any starting offset on the next center, so an already desynchronized ghost recovers instead of leaving the grid. |

## What is **not** in this spec

- Faster eyes, respawn animations, sounds or score pop-ups.
- Ghost-ghost collision, pen occupancy rules or spawn blocking.
- Changes to frightened mode, pellet scoring, mode schedule or release timers.
- Maze layout, render style or HUD changes.
- Pac-Man movement refactoring.
- Automated tests or a debug UI.

Each of those, if it lands, goes in its own spec.
