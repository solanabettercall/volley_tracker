import { PlayerPosition } from '../enums';

export interface PlayerInfo {
  id: number;
  number: number;
  fullName: string;
  isActive?: boolean;
  position?: PlayerPosition;
}
