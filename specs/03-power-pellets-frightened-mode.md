# SPEC 03 — Power pellets and frightened ghosts

> **Status:** Implementado
> **Depends on:** SPEC 01, SPEC 02
> **Date:** 2026-10-28
> **Objective:** Add four power pellets worth 50 points that switch every ghost outside the pen into a 7-second frightened mode in which Pac-Man can eat them for 200/400/800/1600 points.

## Why this spec exists

The game currently has only ordinary dots and ghosts that can never be eaten, so Pac-Man has no way to turn the chase around. Power pellets add the missing risk/reward loop: a scarce 50-point pickup that briefly flips the predator/prey relationship and rewards eating ghosts in a chain.

## Scope

**In:**

- New traversable tile `4` (power pellet), written as `o` in `MAZE_STR` and parsed in `parseTile()`.
- Exactly four pellets at the classic level-1 corners: `(1,3)`, `(26,3)`, `(1,23)`, `(26,23)`.
- Eating a pellet sets the cell to `0`, adds exactly 50 points and does **not** decrement `dotsRemaining`.
- Activating frightened mode for 7000 ms: ghosts outside the pen turn blue, move at `0.05` cells/frame and pick a random direction at every aligned cell.
- One 180° direction reversal for every ghost that is `out` at the moment a pellet is eaten.
- Ghosts blink blue/white during the last 2000 ms of the mode.
- Eating a frightened ghost scores 200, 400, 800 and 1600 for the first, second, third and fourth ghost of the same pellet; the chain resets on every new pellet.
- An eaten ghost becomes eyes (`houseState: 'eaten'`), returns to the pen through the door, waits 1000 ms and exits again as a normal ghost.
- Eyes do not collide with Pac-Man and cannot kill him.
- The scatter/chase timer pauses while frightened mode is active; `elapsedTime` keeps advancing so pen release timers are unaffected.
- Losing a life cancels frightened mode and resets the eat chain; already-eaten pellets and dots do not respawn.
- Rendering: pellets drawn as larger dots, frightened ghosts blue with blink, eaten ghosts as eyes only.
- Restarting the game from the overlay (`createGame()`) restores the four pellets.

**Out of scope (for future specs):**

- Sound effects, score pop-ups or floating "200" labels.
- Fruit bonuses, extra lives or level progression.
- Pellet respawn per life, per level or after a timer.
- Changes to the scatter/chase schedule, normal ghost speeds or pen release timers.
- Changes to the maze layout beyond replacing four dots with pellets.
- High scores, persistence, pause menu or mobile controls.

## Data model

**`src/js/maze.js` — new tile and layout:**

```js
// 'o' -> 4 (power pellet)
function parseTile( ch ) {
  if ( ch === '#' ) return 1;
  if ( ch === '.' ) return 2;
  if ( ch === '-' ) return 3;
  if ( ch === 'o' ) return 4;
  return 0;
}
```

Four cells change from `.` to `o`: `(1,3)`, `(26,3)`, `(1,23)`, `(26,23)`.

**`src/js/game.js` — new constants:**

```js
const POWER_PELLET = 4;
const FRIGHT_DURATION = 7000;       // ms
const FRIGHT_BLINK = 2000;          // last ms of blinking
const FRIGHT_GHOST_SPEED = 0.05;    // cells/frame
const GHOST_EAT_SCORES = [ 200, 400, 800, 1600 ];
const EATEN_RELEASE_DELAY = 1000;   // ms inside the pen before exiting again
const PEN_TARGET = { x: 13.5, y: 13 };
```

**`src/js/game.js` — new game state (added to `createGame()`):**

```js
frightMode: false,
frightTimer: 0,           // ms left in the current pellet
ghostsEatenThisPellet: 0, // index into GHOST_EAT_SCORES
```

**Per-ghost state:** `houseState` gains a fourth value.

```js
houseState: 'waiting', // 'waiting' | 'exiting' | 'out' | 'eaten'
```

Rules:

- `eaten`: the ghost is eyes, ignores collisions, targets `PEN_TARGET`, may cross the door downwards, ignores the no-reverse rule, and becomes `waiting` with `releaseTime = elapsedTime + EATEN_RELEASE_DELAY` when it reaches a pen cell.
- `waiting` / `exiting`: unaffected by frightened mode except for the blue rendering; they cannot be eaten because Pac-Man cannot enter the pen.
- `out`: uses random movement while `frightMode` is true, otherwise the existing AI.
- Each ghost also carries `frightened: false`, a per-pellet immunity flag (not a timer): set when a pellet is eaten, cleared when the ghost is eaten or the mode ends, so a revived ghost is not frightened again by the pellet that ate it.

## Implementation plan

1. **Add the pellet tile** in `src/js/maze.js`: parse `o` as `4`, replace the four corner dots, update the file header comment. Manual test: open `src/index.html`, the game loads with no console errors, the four cells are walkable and the remaining dots are still edible.
2. **Add state and constants** in `src/js/game.js`: constants above, plus `frightMode`, `frightTimer`, `ghostsEatenThisPellet` in `createGame()`. Manual test: the game runs unchanged; nothing is edible yet because `4` is not consumed.
3. **Consume pellets** in `movePacman()`: `grid[y][x] === POWER_PELLET` → set to `0`, `score += 50`, no change to `dotsRemaining`, call `startFrightened( game )`. Manual test: walking over a pellet makes it disappear and adds 50 points.
4. **Implement `startFrightened( game )` and `endFrightened( game )`** in `src/js/game.js`: set/clear the flag and timer, reset `ghostsEatenThisPellet`, reverse `out` ghosts once, and tick `frightTimer` down inside `update()` while playing. Manual test: the 7-second timer expires and collisions return to normal.
5. **Pause the mode schedule** in `updateMode()`: do not advance `modeTimer` while `frightMode` is true; keep advancing `elapsedTime`. Manual test: ghosts still leave the pen on time and the scatter/chase change is delayed until the mode ends.
6. **Frightened movement** in `moveGhost()`: while `frightMode` and `houseState === 'out'`, use `FRIGHT_GHOST_SPEED` and a new `decideFrightenedGhost()` that picks a random valid direction excluding the reverse, falling back to the reverse when it is the only option. Manual test: ghosts slow down and wander without oscillating in corridors.
7. **Eyes return to the pen** in `src/js/game.js`: extend `canMove()` so an `eaten` ghost may cross the door in any direction, add `decideEatenGhost()` targeting `PEN_TARGET` without the no-reverse restriction, and convert the ghost to `waiting` on reaching a pen cell. Manual test: an eaten ghost returns through the door, waits 1 s and leaves again.
8. **Ghost-eat collision** in `update()`: skip ghosts with `houseState === 'eaten'`; when `frightMode` is true, score `GHOST_EAT_SCORES[ ghostsEatenThisPellet++ ]`, set the ghost to `eaten`, clear its frightened speed and do not lose a life; otherwise keep the current life-loss path. Manual test: four ghosts in one pellet give 200/400/800/1600 and no life is lost.
9. **Reset rules** in `resetPositions()` and the life-loss path: call `endFrightened( game )`, reset `ghostsEatenThisPellet`, restore each ghost's speed, `houseState`, `releaseTime` and color as today. Manual test: losing a life restores the pen, cancels the blue mode and keeps eaten pellets gone.
10. **Render** in `src/js/render.js`: draw tile `4` as a pellet of radius ~5.5, draw frightened ghosts in `#2121ff` with white eyes, blink to white when `frightTimer <= FRIGHT_BLINK` (toggle every 200 ms), and draw `eaten` ghosts as eyes only. Manual test: the three states are visually distinguishable.
11. **Full pass in browser**: eat a pellet, eat ghosts, lose a life, finish the level and restart. Manual test: all acceptance criteria below pass.

## Acceptance criteria

- [ ] `src/index.html` opens with no console errors.
- [ ] Exactly four power pellets are visible as larger dots at `(1,3)`, `(26,3)`, `(1,23)` and `(26,23)`.
- [ ] Eating a pellet adds exactly 50 points and removes it from the maze.
- [ ] Eating a pellet does not change `dotsRemaining`; `GANASTE` still requires all ordinary dots.
- [ ] The pellet activates frightened mode for 7000 ms.
- [ ] Every ghost with `houseState === 'out'` turns blue and reverses direction once on activation.
- [ ] Frightened ghosts move at `0.05` cells/frame.
- [ ] Frightened ghosts choose a random valid direction at intersections and do not reverse except in a dead end.
- [ ] During the last 2000 ms ghosts alternate blue and white every 200 ms.
- [ ] When frightened mode ends, ghosts regain their normal color, speed and AI.
- [ ] Eating the first, second, third and fourth ghost of one pellet awards 200, 400, 800 and 1600 points respectively.
- [ ] Eating a new pellet resets the chain to 200 and restarts the 7-second timer.
- [ ] An eaten ghost is drawn as eyes, does not collide with Pac-Man and returns to the pen through the door.
- [ ] A ghost that reaches the pen waits 1000 ms, exits through the door and is not frightened by the pellet that ate it.
- [ ] Touching a non-frightened ghost costs a life exactly as today.
- [ ] Losing a life cancels frightened mode, resets the chain and returns all ghosts to the pen.
- [ ] Losing a life does not restore eaten pellets or eaten dots.
- [ ] The scatter/chase timer is frozen while frightened mode is active and resumes afterwards.
- [ ] Ghost pen releases keep working during frightened mode.
- [ ] Pac-Man is still blocked by the door and the tunnel still wraps.
- [ ] Restarting from the overlay restores the four pellets and the initial score and lives.

## Decisions taken and discarded

- **Yes:** four pellets at `(1,3)`, `(26,3)`, `(1,23)`, `(26,23)`. They match the original level 1 and the existing maze geometry.
- **Yes:** a dedicated tile `4` parsed from `o`. The maze stays the single source of truth for pellet positions.
- **No:** reusing tile `2` plus a separate coordinates list. Two sources of truth would drift.
- **Yes:** pellets award 50 points but do not count towards `dotsRemaining` (user decision). They are a bonus objective, not a win condition.
- **Yes:** a single global `frightMode` + `frightTimer` instead of per-ghost timers. One pellet affects all ghosts and a new pellet restarts the shared timer.
- **Yes:** `houseState: 'eaten'` instead of a separate eyes flag. It reuses the existing state machine and its reset logic.
- **Yes:** eyes may ignore the no-reverse rule and cross the door downwards. The final implementation uses BFS towards `PEN_TARGET` instead of greedy Manhattan: greedy oscillated forever between adjacent cells (row 5, x13↔x14) after returning from distant corners.
- **Yes:** 1000 ms in the pen before an eaten ghost exits again. Short enough to matter, long enough to read as a respawn.
- **Yes:** pause the scatter/chase timer during frightened mode, but keep `elapsedTime`. Release timers must not be delayed by a pellet.
- **Yes:** random movement while frightened (classic behaviour) instead of fleeing or reusing the chase AI.
- **Yes:** one 180° reversal on activation.
- **No:** frightening an eaten ghost again with the pellet that is still active. Revived ghosts return as normal ghosts.
- **No:** restoring eaten pellets on life loss or after the mode ends.
- **No:** sound effects, score pop-ups or extra UI. Cosmetic, deferred.
- **No:** per-ghost frightened durations or per-ghost speeds beyond the 0.05 mode speed.

## Risks

| Risk | Mitigation |
| --- | --- |
| Changing speed mid-cell could break grid alignment and stop turns or eating | Both `0.1` and `0.05` are multiples of `0.05`, so positions always land on integers within a few frames; the existing `aligned()` check keeps working. |
| Reversing frightened ghosts could cause endless oscillation in a corridor | The reversal happens once per pellet; afterwards the random choice excludes the reverse and only allows it in a dead end. |
| Eyes can loop above the door because of the no-reverse rule | Eaten ghosts use a dedicated BFS decision function; greedy Manhattan oscillated in local minima. |
| A ghost revived while the pellet is still active could become blue again | Per-ghost `frightened` flag cleared when eaten; a revived ghost exits and moves as a normal ghost even if `frightMode` is still on. |
| Collision loop awarding points twice in one frame | The collision loop breaks after a ghost is eaten (or after a life is lost), and the ghost is switched to `eaten` before continuing. |
| Forgetting to reset frightened state on life loss | Covered by plan step 9 and three explicit acceptance criteria. |

## What is **not** in this spec

- Sounds, score pop-ups or visual effects beyond the ghost colors and blink.
- Fruit, extra lives or level progression.
- Pellet respawn after a life loss or after the mode ends.
- Changes to the maze layout beyond the four pellet cells.
- Per-ghost frightened timers or new difficulty tuning.
- High scores, persistence, pause menu or mobile controls.

Each of those, if it lands, goes in its own spec.
