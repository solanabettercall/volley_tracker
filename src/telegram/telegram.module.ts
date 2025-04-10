import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { DataprojectModule } from 'src/providers/dataproject/dataproject.module';

@Module({
  imports: [DataprojectModule],
  providers: [TelegramService],
})
export class TelegramModule {}
