import { Injectable } from '@nestjs/common';
import { DataprojectApiService } from './dataproject-api.service';

@Injectable()
export class DataprojectCacheService {
  constructor(private readonly dataprojectApiService: DataprojectApiService) {}
  async foo() {
    // this.dataprojectApiService.
  }
}
