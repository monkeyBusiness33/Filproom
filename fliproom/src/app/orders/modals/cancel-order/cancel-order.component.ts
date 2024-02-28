import { Component, Inject, Input, OnInit } from '@angular/core';
import { FormGroup, FormControl, Validators, FormArray, ValidatorFn, ValidationErrors } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { filter } from 'rxjs/operators';
import { ModalService } from 'src/app/shared/modal/modal.service';
import { Order, OrderLineItem } from 'src/app/shared/models/Order.model';
import { UserService, Account } from '../../../core/user.service';
import { Warehouse } from "../../../shared/models/Warehouse.model";

export interface OrderCancelFormSetting {
  key: string
  value: any
  disabled: boolean
  required: boolean
}

export interface OrderCancelSettings {
  form: OrderCancelFormSetting[]
}
export interface OrderCancelRequest {
  reason: string
  warehouse: Warehouse
  refundShipping?: boolean
  orderLineItems: {
    ID: number,
    restock: boolean,
    warehouseID: number,
    action: 'hold' | 'cancel' | 'refund'
  }[]
}

@Component({
  selector: 'app-cancel-order',
  templateUrl: './cancel-order.component.html',
  styleUrls: ['./cancel-order.component.scss'],
})
export class CancelOrderComponent implements OnInit {
  @Input() data: {
    order: Order,
    orderLineItems: OrderLineItem[];
  }

  public orderCancelForm = new FormGroup({
    reason: new FormControl(null),
    action: new FormControl(null, Validators.required),
    refundShipping: new FormControl({ value: false, disabled: false }, Validators.required),
    restock: new FormControl(false, Validators.required),
    warehouse: new FormControl({ value: null, disabled: true }, Validators.required),
    orderLineItems: new FormArray([]),
  })
  public availableWarehouses: Warehouse[]
  public order: Order

  constructor(
    private _modalCtrl: ModalController,
    private _modalService: ModalService,
    private _user: UserService,
  ) {

  }

  ngOnInit(): void {
    this.availableWarehouses = this._user.account.warehouses
    this.order = this.data.order
    if (this.order.type.name == "inbound") {
      this.orderCancelForm.controls['restock'].setValue(false)
      this.orderCancelForm.controls['restock'].disable()
    }

    this.orderLineItems['controls'] = [];
    this.order.orderLineItems
      .map((oli) =>
        this.orderLineItems.push(
          new FormGroup({
            ID: new FormControl(oli.ID),
            selected: new FormControl(false),
            product: new FormControl(oli.product),
            variant: new FormControl(oli.variant),
            status: new FormControl(oli.status),
            item: new FormControl(oli.item),
            replacePending: new FormControl(oli.replacePending),
            restocked: new FormControl(oli.restocked),
            deliveredAt: new FormControl(oli.deliveredAt),
            canceledAt: new FormControl(oli.canceledAt),
          })
        )
      );
  }

  onCancel() {
    this._modalCtrl.dismiss();
  }

  onSubmit() {
    this.orderCancelForm.markAllAsTouched()
    if (this.orderCancelForm.valid) {
      this._modalService.confirm('Delete Order Line Item? This Action can\'t be undone').pipe(
        filter(confirm => confirm),
      ).subscribe(() => this._modalCtrl.dismiss(this.orderCancelForm.getRawValue(), 'submit'))
    }

  }

  //On Remove & Refund change for refund show refund dropdown
  onActionChange() {
    if (this.orderCancelForm.value.action === 'refund') {
      this.orderCancelForm.controls.refundShipping.enable()
    } else {
      this.orderCancelForm.controls.refundShipping.disable()
    }
  }

  onCheckAllChange(){
    const isSelected = this.orderLineItemsCount > 0 && this.selectedOrderLineItemsCount != this.orderLineItemsCount
    this.orderLineItems['controls'].map((oliForm) => oliForm.patchValue({ selected: isSelected }));
  }

  get shippingCost() {
    const shippingTransaction = this.order.transactions.find((tx) => tx.type === 'shipping')
    if (shippingTransaction) {
      return shippingTransaction.grossAmount
    } else {
      return false
    }
  }

  get orderLineItems() {
    return this.orderCancelForm.get('orderLineItems') as FormArray;
  }

  get orderLineItemsCount() {
    return this.orderLineItems.controls.length
  }

  get selectedOrderLineItems() {
    return this.orderLineItems.controls.filter((oliForm) => oliForm.value.selected)
  }

  get selectedOrderLineItemsCount() {
    return this.selectedOrderLineItems.length
  }

  //On checkbox change for restock inventory show warehouse dropdown
  onRestockInventoryChange(event) {
    //require warehouse if order is of type outbound
    if (event.checked && this.order.type.name == "outbound") {
      this.orderCancelForm.get('warehouse').enable()
      // if only one warehouse is available, set it as default
      if (this.availableWarehouses.length == 1) {
        this.orderCancelForm.get('warehouse').setValue(this.availableWarehouses[0])
      }
    } else {
      this.orderCancelForm.get('warehouse').setValue(null)
      this.orderCancelForm.get('warehouse').disable()
    }
  }

  // used for mat-select patching when objects are used instead of standard values
  compareObjectsByIDFn(o1: Object, o2: Object): boolean {
    return (o1 && o2 && o1['ID'] == o2['ID'])
  }
}
