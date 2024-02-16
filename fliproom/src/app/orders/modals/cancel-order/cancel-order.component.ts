import { Component, Inject, Input, OnInit } from '@angular/core';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ModalController } from '@ionic/angular';
import { filter } from 'rxjs/operators';
import { ModalService } from 'src/app/shared/modal/modal.service';
import {Order, OrderLineItem} from 'src/app/shared/models/Order.model';
import {UserService} from "../../../core/user.service";
import {Warehouse} from "../../../shared/models/Warehouse.model";

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
  restock: boolean
  warehouse: Warehouse
}

@Component({
  selector: 'app-cancel-order',
  templateUrl: './cancel-order.component.html',
  styleUrls: ['./cancel-order.component.scss'],
})
export class CancelOrderComponent implements OnInit {
  @Input() data:  OrderLineItem;

  public orderCancelForm = new FormGroup({
    reason: new FormControl(null),
    restock: new FormControl(false, Validators.required),
    warehouse: new FormControl({value: null, disabled: true}, Validators.required),
  })
  public availableWarehouses : Warehouse[]
  public orderLineItem: OrderLineItem

  constructor(
    private _modalCtrl: ModalController,
    private _modalService: ModalService,
    private _user : UserService,
  ) {

  }

  ngOnInit(): void {
    this.availableWarehouses =this._user.account.warehouses
    this.orderLineItem = this.data
    if (this.orderLineItem.order.type.name == "inbound") {
      this.orderCancelForm.controls['restock'].setValue(false)
      this.orderCancelForm.controls['restock'].disable()
    }
  }

  onCancel() {
    this._modalCtrl.dismiss();
  }

  onSubmit() {
    this.orderCancelForm.markAllAsTouched()
    console.log(this.orderCancelForm.valid)
    if(this.orderCancelForm.valid){
      this._modalService.confirm('Delete Order Line Item? This Action can\'t be undone').pipe(
        filter(confirm => confirm),
      ).subscribe(() => this._modalCtrl.dismiss(this.orderCancelForm.getRawValue(), 'submit'))
    }

  }

  //On checkbox change for restock inventory show warehouse dropdown
  onRestockInventoryChange(event) {
    //require warehouse if order is of type outbound
    if (event.checked && this.orderLineItem.order.type.name == "outbound") {
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
