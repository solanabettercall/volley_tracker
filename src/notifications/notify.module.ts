import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NotifyProcessor } from './notify.processor';
import { NOTIFY_QUEUE } from './notify.const';
import { TelegramModule } from '../telegram/telegram.module';
import { DataprojectModule } from 'src/providers/dataproject/dataproject.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: NOTIFY_QUEUE,
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
      },
    }),
    forwardRef(() => TelegramModule),
  ],
  providers: [NotifyProcessor],
})
export class NotifyModule {}
