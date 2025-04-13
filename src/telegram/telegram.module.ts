import { forwardRef, Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { DataprojectModule } from 'src/providers/dataproject/dataproject.module';
import { MonitoringModule } from 'src/monitoring/monitoring.module';

@Module({
  imports: [DataprojectModule, forwardRef(() => MonitoringModule)],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
