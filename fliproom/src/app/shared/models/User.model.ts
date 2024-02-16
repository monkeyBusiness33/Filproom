import { Role } from 'src/app/core/iam.service';
import { Account } from 'src/app/core/user.service';
import { Deserializable } from './helpers/deserializable';
import { Warehouse } from './Warehouse.model';

export class User  {
  ID: number
  account: Account
  accountID: number
  name: string
  surname: string
  password: string
  activatedAt: string
  email: string
  role: Role
  emailNotifications: string
  phoneNumber: string
  lastVisitAt: Date
  phoneCountryCode: string

  constructor(input: any) {
    if (input == null) return

    input.warehouse = new Warehouse(input.warehouse)

    input.phoneNumber = input.phoneNumber && input.phoneCountryCode ?`+${input.phoneCountryCode || ''} ${input.phoneNumber}`: input.phoneNumber? input.phoneNumber: null

    return Object.assign(this, input);
  }

  get fullName(): string {
    return `${this.name} ${this.surname}`
  }

  get notificationEvents(): string[] {
    return this.emailNotifications ? this.emailNotifications.split(",") : []
  }


}
