import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { appConfig } from './config';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useGlobalFilters(new GlobalExceptionFilter());

  process.on('unhandledRejection', (reason) => {
    new Logger('UnhandledRejection').error(reason);
  });

  process.on('uncaughtException', (error) => {
    new Logger('UncaughtException').error(error.message, error.stack);
    process.exit(1);
  });

  await app.listen(appConfig.port ?? 3000);
}

bootstrap().catch((err) => {
  new Logger('Bootstrap').error('Failed to start application', err);
  process.exit(1);
});
