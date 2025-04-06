import { Module } from '@nestjs/common';
import { DataprojectService } from './dataproject.service';
import { DataprojectController } from './dataproject.controller';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  providers: [DataprojectService],
  controllers: [DataprojectController],
})
export class DataprojectModule {}
