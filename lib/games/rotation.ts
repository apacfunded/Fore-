// Which game each round plays. Safe to import on the server and in the browser.
// Rounds take turns in this order: round 1 is the first game, round 2 the second, and so on.
// To drop or reorder games, set NEXT_PUBLIC_GAMES to a comma list of keys, e.g. "golf,plinko,moon".

export type GameMeta = {
  key: string;
  name: string;   // shown in the rotation strip and the HUD
  win: string;    // the big word on the winner screen
  noun: string;   // what each entry is: ball, chip, duck...
  hud: string;    // little detail line under the game name
};

export const ALL_GAMES: GameMeta[] = [
  { key: 'golf',    name: 'Golf',        win: 'HOLE IN ONE',       noun: 'ball',   hud: 'Par 5 · 740 yds' },
  { key: 'plinko',  name: 'Plinko',      win: 'JACKPOT',           noun: 'chip',   hud: '12 rows · hit the middle slot' },
  { key: 'derby',   name: 'Duck Derby',  win: 'FIRST PAST THE POST', noun: 'duck', hud: 'First duck home wins' },
  { key: 'skee',    name: 'Skee-Ball',   win: '100!',              noun: 'ball',   hud: 'Sink the 100 cup' },
  { key: 'darts',   name: 'Darts',       win: 'BULLSEYE',          noun: 'dart',   hud: 'Hit the inner bull' },
  { key: 'bowling', name: 'Bowling',     win: 'STRIKE',            noun: 'ball',   hud: 'Only a strike wins' },
  { key: 'hoops',   name: 'Half-Court',  win: 'SWISH',             noun: 'shot',   hud: 'Nothing but net' },
  { key: 'pusher',  name: 'Coin Pusher', win: 'JACKPOT',           noun: 'coin',   hud: 'Tip the ledge' },
  { key: 'sumo',    name: 'Sumo Ring',   win: 'LAST ONE STANDING', noun: 'marble', hud: 'Last marble in the ring wins' },
  { key: 'moon',    name: 'Moon Shot',   win: 'TO THE MOON',       noun: 'rocket', hud: 'First rocket to land wins' },
];

export function rotation(): GameMeta[] {
  const raw = (process.env.NEXT_PUBLIC_GAMES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const picked = raw.map((k) => ALL_GAMES.find((g) => g.key === k)).filter((g): g is GameMeta => !!g);
  return picked.length ? picked : ALL_GAMES;
}

/** The game a round plays. Rounds with no callouts stay open, so the same game waits until someone plays it. */
export function gameForRound(roundId: number): GameMeta {
  const list = rotation();
  return list[(((roundId - 1) % list.length) + list.length) % list.length];
}

export function metaFor(key: string): GameMeta {
  return ALL_GAMES.find((g) => g.key === key) ?? ALL_GAMES[0];
}
