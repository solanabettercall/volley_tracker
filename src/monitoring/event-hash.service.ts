import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as moment from 'moment';
import { Model } from 'mongoose';
import { EventHash } from 'src/schemas/event-hash.schema';

@Injectable()
export class EventHashService {
  constructor(
    @InjectModel(EventHash.name)
    private readonly eventHashModel: Model<EventHash>,
  ) {}

  private logger = new Logger(EventHashService.name);

  async checkAndSaveEventHash(hash: string): Promise<boolean> {
    try {
      const existingHash = await this.eventHashModel.findOne({ hash });

      if (existingHash) {
        this.logger.debug(`Хэш ${hash} существует. Пропуск.`);
        return false;
      }

      await this.eventHashModel.create({ hash });
      this.logger.debug(`Хэш ${hash} успешно сохранен.`);
      return true;
    } catch (error) {
      this.logger.error(
        `Ошибка при проверке и сохранении хэша ${hash}: ${error.message}`,
      );
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_10_HOURS, { name: 'deleteOldHashes' })
  async deleteOldHashes(): Promise<void> {
    const tenDaysAgo = moment().subtract(10, 'days').toDate();
    const { deletedCount } = await this.eventHashModel.deleteMany({
      createdAt: { $lt: tenDaysAgo },
    });

    Logger.log(`Очищено ${deletedCount} устаревших хэшей событий`);
  }
}
