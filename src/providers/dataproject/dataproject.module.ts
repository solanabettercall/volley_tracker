import { Module } from '@nestjs/common';
import { DataprojectService } from './dataproject.service';
import { DataprojectController } from './dataproject.controller';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    HttpModule.register({
      proxy: {
        host: '172.26.208.1',
        port: 8888,
        protocol: 'http',
      },
    }),
  ],
  providers: [DataprojectService],
  controllers: [DataprojectController],
})
export class DataprojectModule {}
