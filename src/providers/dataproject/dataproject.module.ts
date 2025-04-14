import { Module } from '@nestjs/common';
import { DataprojectApiService } from './dataproject-api.service';
import { DataprojectController } from './dataproject.controller';
import { HttpModule, HttpModuleOptions } from '@nestjs/axios';
import { appConfig } from 'src/config';

@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: () => {
        const options: HttpModuleOptions = {};
        if (appConfig.env === 'local') {
          options.proxy = {
            host: '172.26.208.1',
            port: 8888,
            protocol: 'http',
          };
        }

        return options;
      },
    }),
  ],
  providers: [DataprojectApiService],
  controllers: [DataprojectController],
  exports: [DataprojectApiService],
})
export class DataprojectModule {}
