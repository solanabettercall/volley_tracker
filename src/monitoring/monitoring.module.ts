import { Module } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { DataprojectModule } from 'src/providers/dataproject/dataproject.module';
import { MongooseModule } from '@nestjs/mongoose';
import { MonitoredTeamSchema } from 'src/schemas/monitoring.schema';

@Module({
  imports: [
    DataprojectModule,
    MongooseModule.forFeature([
      { name: 'MonitoredTeam', schema: MonitoredTeamSchema },
    ]),
  ],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
