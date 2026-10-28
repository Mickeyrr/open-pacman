# SPEC 01 — Four ghosts with classic AI

> **Status:** Implementado
> **Depends on:** None
> **Date:** 2026-10-28
> **Objective:** Replace the current two ghosts with four ghosts (Blinky, Pinky, Inky, Clyde), each with distinct classic Pac-Man behavior, with Blinky aggressively chasing Pac-Man.

## Scope

**In:**
- Replace `hunter`/`random` ghosts with four ghosts: Blinky (red), Pinky (pink), Inky (cyan), Clyde (orange).
- Implement classic target calculation for each ghost.
- Implement global `Scatter/Chase` mode with timers (no power-up/frightened mode in this spec).
- Ghosts leave the house by timer: ~1.5 seconds apart (typical arcade order).
- Assign each ghost its own distinct scatter corner.
- Use the same speed for all ghosts (`GHOST_SPEED` unchanged).
- Render four ghosts with distinct colors; keep eyes facing direction.
- Keep existing rules: door (`3`) blocks Pac-Man and allows ghosts; tunnel behavior unchanged.

**Out of scope (for future specs):**
- Power-up pills / frightened/blue ghosts / flashing / eaten mode.
- Speed variations per ghost or per mode.
- Elroy/speed increases based on dots eaten.
- Ghost pathfinding visualizations or debug UI.
- Changes to Pac-Man movement, lives, scoring rules (beyond existing behavior).

## Data model

This feature modifies existing structures. No new top-level persisted data structures are introduced.

**`src/js/maze.js` — `GHOST_STARTS` (updated):**
```js
const GHOST_STARTS = [
  { x: 13, y: 14, kind: 'blinky', color: 'red',    scatter: { x: 25, y: -3 } },
  { x: 14, y: 14, kind: 'pinky',  color: 'pink',   scatter: { x: 2,  y: -3 } },
  { x: 13, y: 15, kind: 'inky',   color: 'cyan',   scatter: { x: 27, y: 31 } },
  { x: 14, y: 15, kind: 'clyde',  color: 'orange', scatter: { x: 0,  y: 31 } },
];
```

**`src/js/game.js` — per-ghost runtime state (added):**
```js
ghosts: GHOST_STARTS.map((g, i) => ({
  x: g.x,
  y: g.y,
  dir: 'up',
  speed: GHOST_SPEED,
  kind: g.kind,
  color: g.color,
  scatter: g.scatter,
  inHouse: true,        // starts inside pen
  releaseTime: i * 1500, // ms from game start for release
  mode: 'scatter',      // mirrored from global mode
}));
```

**Global mode state (added to game):**
```js
{
  mode: 'scatter',      // 'scatter' | 'chase'
  modeTimer: 0,         // elapsed ms in current mode
  modeIndex: 0,         // index into mode schedule
}
```

**Target calculation helpers (conceptual):**
- `getBlinkyTarget(pacman)` → `{x: px, y: py}`
- `getPinkyTarget(pacman, dir)` → 4 tiles ahead of Pac-Man in `dir`
- `getInkyTarget(pacman, dir, blinky)` → vector from Blinky to 2 tiles ahead of Pac-Man, doubled
- `getClydeTarget(pacman, ghost)` → if distance(ghost, pacman) > 8 tiles → pacman position; else → ghost's scatter corner

## Implementation plan

1. **Update maze starts** (`src/js/maze.js`): Replace `GHOST_STARTS` with 4 entries (Blinky/Pinky/Inky/Clyde) including `kind`, `color`, `scatter` corner. Keep positions inside the pen.
2. **Extend game state** (`src/js/game.js`): Update `createGame()` to initialize ghosts with `inHouse`, `releaseTime` (every 1.5s), `color`, `scatter`. Add global `mode`, `modeTimer`, `modeIndex` to game state.
3. **House release logic** (`src/js/game.js`): Track elapsed time in `update()`. When enough time has passed and ghost `inHouse`, allow it to leave. Door remains passable by ghosts.
4. **Global mode timer** (`src/js/game.js`): Update `modeTimer` each frame while playing; alternate `scatter`/`chase` on schedule.
5. **Implement classic AI** (`src/js/game.js`): Replace `decideGhost()` with target-based decision per ghost based on kind and mode. Pick valid move (ghosts blocked only by walls `1`) with smallest Manhattan distance to target. Respect tunnel wrap.
6. **Update movement/collision/reset** (`src/js/game.js`): Ensure `moveGhost()` works with new ghost objects. `resetPositions()` resets all 4 to start, sets `inHouse` true, resets timers/dirs.
7. **Update rendering** (`src/js/render.js`): Draw each ghost by `g.color` (red/pink/cyan/orange). Keep eyes facing direction.
8. **Manual verification**: Load `src/index.html`, verify 4 ghosts, release timing, behaviors, scatter/chase, collisions, win/lose.

## Acceptance criteria

- [ ] Game loads without console errors with 4 ghosts.
- [ ] Exactly 4 ghosts appear: Blinky (red), Pinky (pink), Inky (cyan), Clyde (orange).
- [ ] Ghosts start inside the house and leave one after another with ~1.5s intervals.
- [ ] Blinky targets Pac-Man's current position and chases aggressively.
- [ ] Pinky targets 4 tiles ahead of Pac-Man's current direction.
- [ ] Inky's target is computed from Blinky's position and 2 tiles ahead of Pac-Man.
- [ ] Clyde chases Pac-Man when far away (> 8 tiles) and targets its scatter corner when within 8 tiles.
- [ ] Each ghost has a distinct scatter corner and uses it during `Scatter` mode.
- [ ] Global `Scatter/Chase` alternates via timers.
- [ ] All ghosts move at same speed as before.
- [ ] Door (`3`) blocks Pac-Man; ghosts can pass door.
- [ ] Colliding with any ghost costs a life and resets positions; game over at 0 lives.
- [ ] Eating all dots results in `GANASTE` (win).
- [ ] No power-up/frightened behavior present.

## Decisions taken and discarded

- **Yes:** Replace `hunter`/`random` with 4 classic ghosts.
- **Yes:** Classic roles (Blinky/Pinky/Inky/Clyde).
- **Yes:** Global `Scatter/Chase` with timers.
- **Yes:** Release by timer, ~1.5s apart.
- **Yes:** Same speed for all ghosts.
- **Yes:** Four distinct colors.
- **No:** Frightened/blue mode and power-ups (not in maze, not requested).
- **No:** Per-ghost speed variations (deferred).
- **No:** Keeping old `hunter`/`random` alongside new ones.

## Risks

| Risk | Mitigation |
| --- | --- |
| Target calculations feel off due to grid alignment/tunnel | Use rounded/grid-aligned positions, respect tunnel wrap, test in tunnel area. |
| House release timing conflicts with reset/respawn | Reset release timers relative to game start/reset; track elapsed time explicitly. |
| Inky target depends on Blinky position/order of updates | Compute targets using current positions before moving ghosts in consistent order. |
| Mode timers feel too fast/slow | Make schedule easy to tweak and verify both modes occur. |

## What is **not** in this spec

- Power-up pills, frightened/blue ghosts, eaten mode.
- Speed curve changes or per-level speed differences.
- New UI elements beyond existing overlay/HUD.
- Sound effects.
- Maze changes.
- Changes to Pac-Man lives/scoring values.
