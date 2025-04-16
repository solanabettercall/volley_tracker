import { PlayerInfo } from './player-info.interface';

export interface TeamInfo {
  id: number;
  name: string;
  competition: string;
  players: PlayerInfo[];
}
