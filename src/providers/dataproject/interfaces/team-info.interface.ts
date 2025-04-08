import { PlayerInfo } from './player-info.interface';

export interface TeamInfo {
  id: number;
  name: string;
  players: PlayerInfo[];

  addedPlayers?: PlayerInfo[];
  removedPlayers?: PlayerInfo[];
}
