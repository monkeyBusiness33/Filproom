// updated version still contains deprecated code that is not used and should be removed
import { Injectable } from '@angular/core';

export interface Role {
  ID: number;
  type: string;
  name: string;
  notes: string;
  companyBranchID: number;
  permissions: Permission[];
}

export interface Permission {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  resource: {
    ID: number;
    name: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class IAMService {
/**********
 Interface for managing users permission.
 Behind the gets methods, we can define whatever logic we need for the permissions
 without changing the code everywhere
*********/
  private permissions = []

  constructor() { }

  initialize(userRole: Role) {
    this.permissions = userRole.permissions.map(permission => permission.resource.name)
  }

  isGranted(permissionName) {
    return this.permissions.length != 0 && this.permissions.includes(permissionName)
  }


  get order() {
    return {
      view: this.isGranted('order.view'),
      create: this.isGranted('order.create'),
      update: this.isGranted('order.update'),
      accept: this.isGranted('order.accept'),
      cancel: this.isGranted('order.cancel'),
      replace: this.isGranted('order.replace'),
      fulfill: this.isGranted('order.fulfill'),
      dispatch: this.isGranted('order.dispatch'),
      deliver: this.isGranted('order.deliver'),
    }
  }

  get purchase() {
    return {
      view: this.isGranted('purchase.view'),
    }
  }

  get fulfillment() {
    return {
      update: this.isGranted('fulfillment.update'),
    }
  }

  get address() {
    return {
      view: this.isGranted('address.view'),
      create: this.isGranted('address.create'),
      update: this.isGranted('address.update')
    }
  }

  get inventory() {
    return {
      view: this.isGranted('inventory.view'),
      create: this.isGranted('inventory.create'),
      update: this.isGranted('inventory.update'),
      virtual: this.isGranted('inventory.virtual'),
      view_cost: this.isGranted('inventory.view_cost'),
    }
  }

  get product() {
    return {
      view: this.isGranted('product.view'),
      create: this.isGranted('product.create'),
      update: this.isGranted('product.update')
    }
  }

  get transaction() {
    return {
      view: this.isGranted('transaction.view'),
      create: this.isGranted('transaction.create'),
      update: this.isGranted('transaction.update'),
      pay: this.isGranted('transaction.pay'),
    }
  }

  get report() {
    return {
      view: this.isGranted('report.view'),
    }
  }

  get account() {
    return {
      create: this.isGranted('account.create'),
      edit: this.isGranted('account.edit'),
      delete: this.isGranted('account.delete'),
    }
  }

  get service() {
    return {
      warehousing: this.isGranted('service.warehousing'),
      consignment: this.isGranted('service.consignment'),
      transfer: this.isGranted('service.transfer'),
      marketOracle: this.isGranted('service.marketOracle'),
    }
  }

}
