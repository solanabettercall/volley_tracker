import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AxiosError } from 'axios';
import { Request, Response } from 'express';

interface ExtendedError extends Error {
  code?: string;
  response?: any;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    if (!['http', 'https'].includes(host.getType())) {
      this.logNonHttpError(exception);
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = this.buildErrorResponse(exception, request);

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private buildErrorResponse(exception: unknown, request: Request) {
    const baseResponse = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (this.isTelegramError(exception)) {
      return {
        ...baseResponse,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Telegram API Error: ${exception.message}`,
        code: exception.code,
      };
    }

    if (exception instanceof AxiosError) {
      return {
        ...baseResponse,
        statusCode: HttpStatus.BAD_GATEWAY,
        message: 'External service unavailable',
        code: 'NETWORK_ERROR',
      };
    }

    if (exception instanceof Error) {
      return {
        ...baseResponse,
        message: exception.message,
      };
    }

    return baseResponse;
  }

  private logNonHttpError(exception: unknown) {
    if (this.isTelegramError(exception)) {
      this.logger.error(
        `Telegram Error: ${exception.message}`,
        exception.stack,
      );
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error('Unknown error', exception);
    }
  }

  private isTelegramError(err: unknown): err is ExtendedError {
    return (
      err instanceof Error &&
      'code' in err &&
      typeof err.code === 'string' &&
      err.code.startsWith('ETELEGRAM')
    );
  }
}
