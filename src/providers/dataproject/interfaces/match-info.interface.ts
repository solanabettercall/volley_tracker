import { MatchStatus } from '../enums';
import { TeamInfo } from './team-info.interface';

export interface MatchInfo {
  id: number;
  status: MatchStatus;
  home: TeamInfo;
  guest: TeamInfo;
  competition?: string;
}
