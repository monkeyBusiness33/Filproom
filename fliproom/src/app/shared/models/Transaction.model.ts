import {Order, OrderLineItem} from "./Order.model";
import { User } from './User.model';
import { Account } from 'src/app/core/user.service';

export class Transaction {
  ID: number;
  stripeID: string;
  type: string;
  status: string;
  paymentMethod: string;
  reference: string;
  currency: string;
  gateway: string;
  completedAt: Date;
  revertedAt: Date;
  updatedAt: Date;
  processedByUser: User
  feesAmount: number;
  grossAmount: number;
  netAmount: number;
  toAccountID: number;
  toAccount: Account
  fromAccountID: number;
  fromAccount: Account
  order: Order
  orderID: number
  orderLineItemID: number
  orderLineItem: OrderLineItem
  childTxs: Transaction[]
  parentTx: Transaction

  constructor(input: any) {
    if (input == null) return

    input.createdByUser = new User(input.createdByUser);

    input.feesAmount = Number(input.feesAmount);
    input.grossAmount = Number(input.grossAmount);
    input.netAmount = Number(input.netAmount);

    input.toAccount = new Account(input.toAccount);
    input.fromAccount = new Account(input.fromAccount);
    input.processedByUser = new User(input.processedByUser)

    input.order = new Order(input.order);
    input.orderLineItem = new OrderLineItem(input.orderLineItem);
    input.childTxs = (input.childTxs || []).map(tx => new Transaction(tx))
    input.parentTx = new Transaction(input.parentTx)

    return Object.assign(this, input);
  }

  get statusColor(): string {
    switch (this.status) {
      case 'unpaid':
        return 'warning'
      case 'processing':
        return 'warning'
      case 'canceled':
        return 'error'
      case 'reverted':
        return 'error'
      case 'paid':
        return 'success'
    }
  }

  get actualAmount(): number {
    return this.status == "canceled" ? 0 : this.grossAmount - this.childTxs.reduce((acc, tx) => acc += tx.grossAmount, 0)
  }
}


export class StripeBalance {
  availableBalance: Balance;
  pendingBalance: Balance;
  reservedBalance: Balance;

  constructor(input: any) {
  if (input == null) return

    input.availableBalance = input.availableBalance ? new Balance(input.availableBalance) : null
    input.pendingBalance = input.pendingBalance ? new Balance(input.pendingBalance) : null
    input.reservedBalance = input.reservedBalance ? new Balance(input.reservedBalance) : null
  return Object.assign(this, input);
  }
}

export class Balance {
  amount: number;
  currency: string;

  constructor(input: any) {
    return Object.assign(this, input);
  }
}

export class RevolutBalance {
  balance: number
  created_at: string
  currency: string
  id: string
  name: string
  public: boolean
  state: string
  updated_at: string

    constructor(input: any) {
      return Object.assign(this, input);
    }
}
