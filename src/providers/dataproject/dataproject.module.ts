import { Module } from '@nestjs/common';
import { DataprojectApiService } from './dataproject-api.service';
import { DataprojectController } from './dataproject.controller';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    HttpModule.register({
      // proxy: {
      //   host: '172.26.208.1',
      //   port: 8888,
      //   protocol: 'http',
      // },
    }),
  ],
  providers: [DataprojectApiService],
  controllers: [DataprojectController],
  exports: [DataprojectApiService],
})
export class DataprojectModule {}
