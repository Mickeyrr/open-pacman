# AGENTS.md

## Spec-Driven Workflow
- **Purpose**: Learning project to practice Spec-Driven Development (see README).
- **Approach**: Changes should be driven by specs/requirements first (define what to build before implementing). Keep behavior aligned with Pac-Man MVP rules already in code.
- **Guideline**: When adding features/fixes, state acceptance criteria clearly and implement minimal changes in the existing globals/script-tag structure.
- **Skills installed** (from `skills-lock.json`): `spec` (klerith/fernando-skills, `skills/engineering/spec/SKILL.md`) and `spec-impl` (klerith/fernando-skills, `skills/engineering/spec-impl/SKILL.md`). Definitions live in `.agents/skills/{spec,spec-impl}/SKILL.md`. Use `/spec` to design specs in `specs/` (section by section, ask questions, save as `NN-slug.md`), `/spec-impl <NN-slug|NN>` to implement only approved specs on a `spec-NN-slug` branch with step-by-step pauses.

## Run
- Open `src/index.html` directly in a browser (no build/bundler). Scripts load via `<script>` tags in order: `maze.js`, `game.js`, `render.js`, `main.js`. Canvas 560x620 (28x31 @ 20px).

## Architecture
- **Entry/UI**: `src/index.html` — canvas `#game`, overlay `#overlay` (Start/Restart). Text in Spanish.
- **Maze**: `src/js/maze.js` — `MAZE_STR` 28x31 parsed to `MAZE` (1=wall, 2=dot, 3=door, 0=empty). Globals: `window.MAZE`, `window.TUNNEL_ROW=14`, `window.PACMAN_START={x:13,y:23}`, `window.GHOST_STARTS` (hunter at (13,14), random at (14,14)).
- **State/rules**: `src/js/game.js` — `createGame()` copies `MAZE`, clears start cell to 0, counts dots. Globals: `window.createGame`, `window.update`, `window.DIRS`. Speeds `PACMAN_SPEED=0.125`, `GHOST_SPEED=0.1`. Tunnel wrap only on `TUNNEL_ROW` across left/right edges. Pacman blocked by 1 and 3; ghosts blocked only by 1. Eating dot (2)->0 gives +10, `dotsRemaining--`. Collision (<0.5) costs life, resets positions if lives>0 else `lost`. All dots eaten -> `won`.
- **Render**: `src/js/render.js` — walls connect adjacent wall centers, door drawn separately, dots, animated Pacman, ghosts with eyes facing direction, HUD (SCORE/VIDAS). `window.draw`.
- **Loop/input**: `src/js/main.js` — `requestAnimationFrame` loop, arrow keys set `pacman.nextDir` only when playing, overlay shows `GANASTE`/`PERDISTE` to restart.

## Gotchas
- **No modules**: everything uses `window.*` globals; script tag order matters.
- **Movement is sub-tile**: 0.1/0.125 per frame; turns/eating only happen when aligned to grid (`aligned` ~1e-3).
- **Ghost AI**: `hunter` picks move with smallest Manhattan to rounded Pacman; `random` picks among non-reverse choices; if none, allows reverse. Both decide only when aligned.
- **Door (3)** passable by ghosts, blocks Pacman.
- **Start cell**: `createGame()` sets `grid[PACMAN_START.y][PACMAN_START.x]=0` so it’s never a dot.
