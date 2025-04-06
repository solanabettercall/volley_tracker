import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DataprojectModule } from './providers/dataproject/dataproject.module';

@Module({
  imports: [DataprojectModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
