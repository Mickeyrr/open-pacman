// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames
const GHOST_SPEED = 0.1;    // 1/10 celda/frame

// Geometria de la casa de los fantasmas (filas 13-15, columnas 11-16).
const PEN = { xMin: 11, xMax: 16, yMin: 13, yMax: 15 };
const PEN_DOOR_ROW = 12;
const PEN_EXIT_ROW = 11; // primera fila fuera de la casa

const MODE_SCHEDULE = [
  { mode: 'scatter', time: 7000 },
  { mode: 'chase', time: 20000 },
  { mode: 'scatter', time: 7000 },
  { mode: 'chase', time: 20000 },
  { mode: 'scatter', time: 5000 },
  { mode: 'chase', time: 20000 },
  { mode: 'scatter', time: 5000 },
  { mode: 'chase', time: Infinity },
];

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let dots = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 ) dots++;

  return {
    state: 'start',
    score: 0,
    lives: 3,
    dotsRemaining: dots,
    grid,
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    ghosts: GHOST_STARTS.map( ( g, i ) => ( {
      x: g.x,
      y: g.y,
      dir: 'up',
      speed: GHOST_SPEED,
      kind: g.kind,
      color: g.color,
      scatter: g.scatter ? { x: g.scatter.x, y: g.scatter.y } : { x: 0, y: -3 },
      houseState: 'waiting',
      releaseTime: i * 1500,
    } ) ),
    mode: 'scatter',
    modeTimer: 0,
    modeIndex: 0,
    elapsedTime: 0,
  };
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// Una celda es muro para el actor dado?
//   pacman: bloqueado por pared (1) y puerta (3)
//   ghost:  bloqueado solo por pared (1); la puerta se valida en canMove()
function isWall( grid, x, y, actor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 && actor === 'pacman' ) return true;
  return false;
}

function isDoor( grid, x, y ) {
  if ( y < 0 || y >= grid.length ) return false;
  if ( x < 0 || x >= grid[ 0 ].length ) return false;
  return grid[ y ][ x ] === 3;
}

function isPenCell( x, y ) {
  const cx = Math.round( x );
  const cy = Math.round( y );
  return cx >= PEN.xMin && cx <= PEN.xMax && cy >= PEN.yMin && cy <= PEN.yMax;
}

// Puede el actor avanzar desde (x,y) en la direccion dir?
function canMove( grid, x, y, dir, actor ) {
  const d = DIRS[ dir ];
  if ( !d ) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if ( ty === TUNNEL_ROW && ( tx < 0 || tx >= grid[ 0 ].length ) ) return true;
  // Puerta de un solo sentido: el fantasma solo la cruza hacia arriba desde dentro.
  if ( actor === 'ghost' && isDoor( grid, tx, ty ) ) {
    return dir === 'up' && isPenCell( x, y );
  }
  return !isWall( grid, tx, ty, actor );
}

function wrapTunnel( a, width ) {
  if ( Math.round( a.y ) === TUNNEL_ROW ) {
    if ( a.x < 0 ) a.x += width;
    else if ( a.x >= width ) a.x -= width;
  }
}

function movePacman( game ) {
  const p = game.pacman;
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( p.x ) && aligned( p.y ) ) {
    p.x = Math.round( p.x );
    p.y = Math.round( p.y );

    // Aplicar giro pendiente si es posible.
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, 'pacman' ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot.
    if ( grid[ p.y ][ p.x ] === 2 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += 10;
      game.dotsRemaining--;
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

function getTarget( game, g ) {
  const grid = game.grid;
  const p = game.pacman;
  const ghosts = game.ghosts;
  const mode = game.mode;

  if ( g.houseState !== 'out' ) {
    // Mientras espera o sale, el objetivo es la salida de la casa.
    return { x: 13.5, y: PEN_EXIT_ROW };
  }

  if ( mode === 'scatter' ) {
    if ( g.scatter ) return { x: g.scatter.x, y: g.scatter.y };
  }

  const px = Math.round( p.x );
  const py = Math.round( p.y );

  if ( g.kind === 'blinky' ) {
    return { x: px, y: py };
  } else if ( g.kind === 'pinky' ) {
    const pd = DIRS[ p.dir ] || { x: 0, y: 0 };
    // 4 tiles ahead of Pac-Man
    return { x: px + pd.x * 4, y: py + pd.y * 4 };
  } else if ( g.kind === 'inky' ) {
    const blinky = ghosts.find( ( gh ) => gh.kind === 'blinky' ) || ghosts[ 0 ];
    const pd = DIRS[ p.dir ] || { x: 0, y: 0 };
    const ax = px + pd.x * 2;
    const ay = py + pd.y * 2;
    const bx = Math.round( blinky.x );
    const by = Math.round( blinky.y );
    const vx = ax - bx;
    const vy = ay - by;
    return { x: bx + vx * 2, y: by + vy * 2 };
  } else if ( g.kind === 'clyde' ) {
    const gx = Math.round( g.x );
    const gy = Math.round( g.y );
    const dist = Math.abs( gx - px ) + Math.abs( gy - py );
    if ( dist > 8 ) {
      return { x: px, y: py };
    } else {
      if ( g.scatter ) return { x: g.scatter.x, y: g.scatter.y };
    }
  }

  // Default
  return { x: px, y: py };
}

function decideGhost( game, g ) {
  const grid = game.grid;

  const target = getTarget( game, g );

  const options = Object.keys( DIRS ).filter(
    ( dir ) => dir !== OPPOSITE[ g.dir ] && canMove( grid, g.x, g.y, dir, 'ghost' )
  );
  // Sin salida (callejon): permitir el giro de 180.
  const choices = options.length ? options : [ '' + OPPOSITE[ g.dir ] ];

  let best = choices[ 0 ];
  let bestDist = Infinity;
  for ( const dir of choices ) {
    const d = DIRS[ dir ];
    let nx = g.x + d.x;
    let ny = g.y + d.y;
    // Consider tunnel wrap for distance calculation
    if ( ny === TUNNEL_ROW ) {
      if ( nx < 0 ) nx += grid[ 0 ].length;
      else if ( nx >= grid[ 0 ].length ) nx -= grid[ 0 ].length;
    }
    const dist = Math.abs( nx - target.x ) + Math.abs( ny - target.y );
    if ( dist < bestDist ) {
      bestDist = dist;
      best = dir;
    }
  }
  g.dir = best;
}

function moveGhost( game, g ) {
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );

    // Handle house release
    if ( g.houseState === 'waiting' ) {
      if ( game.elapsedTime >= g.releaseTime ) {
        // Try to exit house - go up through door area
        if ( canMove( grid, g.x, g.y, 'up', 'ghost' ) ) {
          g.houseState = 'out';
          g.dir = 'up';
        } else {
          // If can't move up, try to decide normally
          decideGhost( game, g );
          if ( !canMove( grid, g.x, g.y, g.dir, 'ghost' ) ) return;
        }
      } else {
        // Still in house, wait
        return;
      }
    } else {
      decideGhost( game, g );
      if ( !canMove( grid, g.x, g.y, g.dir, 'ghost' ) ) return;
    }
  }

  const d = DIRS[ g.dir ];
  g.x += d.x * g.speed;
  g.y += d.y * g.speed;
  wrapTunnel( g, width );
}

function resetPositions( game ) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  game.ghosts.forEach( ( g, i ) => {
    const start = GHOST_STARTS[ i ];
    g.x = start.x;
    g.y = start.y;
    g.dir = 'up';
    g.houseState = 'waiting';
    g.releaseTime = i * 1500;
    if ( start.color ) g.color = start.color;
    if ( start.scatter ) g.scatter = { x: start.scatter.x, y: start.scatter.y };
    if ( start.kind ) g.kind = start.kind;
  } );
  game.mode = 'scatter';
  game.modeTimer = 0;
  game.modeIndex = 0;
  game.elapsedTime = 0;
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

function updateMode( game ) {
  if ( game.state !== 'playing' ) return;
  game.modeTimer += 1000 / 60; // Approximate frame time
  game.elapsedTime += 1000 / 60;

  if ( game.modeIndex < MODE_SCHEDULE.length ) {
    const current = MODE_SCHEDULE[ game.modeIndex ];
    if ( game.modeTimer >= current.time ) {
      game.modeTimer = 0;
      game.modeIndex++;
      if ( game.modeIndex < MODE_SCHEDULE.length ) {
        game.mode = MODE_SCHEDULE[ game.modeIndex ].mode;
      } else {
        game.mode = 'chase';
      }
    }
  }
}

function update( game ) {
  updateMode( game );
  movePacman( game );
  game.ghosts.forEach( ( g ) => moveGhost( game, g ) );

  for ( const g of game.ghosts ) {
    if ( collides( game.pacman, g ) ) {
      game.lives--;
      if ( game.lives <= 0 ) {
        game.state = 'lost';
        return;
      }
      resetPositions( game );
      break;
    }
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
