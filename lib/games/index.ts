// The arcade games other than golf. Golf rounds are drawn by components/GolfCourse (the 3D par 5).
import type { Game } from './util';
import { plinko } from './plinko';
import { derby } from './derby';
import { skee } from './skee';
import { darts } from './darts';
import { bowling } from './bowling';
import { hoops } from './hoops';
import { pusher } from './pusher';
import { sumo } from './sumo';
import { moon } from './moon';

export const GAMES: Record<string, Game> = { plinko, derby, skee, darts, bowling, hoops, pusher, sumo, moon };
export const gameImpl = (key: string): Game => GAMES[key] ?? plinko;
export const isGolf = (key: string | undefined | null) => !key || key === 'golf';
export type { Built, Game, Result } from './util';
