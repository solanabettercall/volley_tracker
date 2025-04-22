import { PlayerStatistic } from '../dataproject-api.service';
import { PlayerPosition } from '../enums';

export interface PlayerInfo {
  id: number;
  number?: number;
  fullName: string;
  isActive?: boolean;
  position?: PlayerPosition;
  statistic?: PlayerStatistic | null;
  endDate?: Date;
}
