import { UserService } from "src/app/core/user.service";
import { User } from "./User.model";
import { Warehouse } from "./Warehouse.model";
import { TitleCasePipe } from "@angular/common";

import * as moment from 'moment';

export class ReportMetadata {
  ID: number
  type: string
  viewedAt: Date
  createdAt: Date

  constructor(data: any) {
    if (data == null) return

    return Object.assign(this, data)
  }

  get message(): string {
    switch (this.type) {
      case 'dead-listing':
        return `Your report for dead listings is ready!`
    }
  }

  get fromNow(): string {
    return moment(this.createdAt).fromNow()
  }
}