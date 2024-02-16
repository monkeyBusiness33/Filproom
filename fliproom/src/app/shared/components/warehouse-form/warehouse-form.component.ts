import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { UtilService } from 'src/app/core/util.service';
import { ModalService } from '../../modal/modal.service';
import { Address } from '../../models/Address.model';
import { Warehouse } from '../../models/Warehouse.model';
import {AddressContactPage} from "../../../orders/modals/address-contact/address-contact.page";
import { filter } from 'rxjs/operators';

export interface IWarehouseForm {
  warehouse: Warehouse
}

@Component({
  selector: 'app-warehouse-form',
  templateUrl: './warehouse-form.component.html',
  styleUrls: ['./warehouse-form.component.scss'],
})
export class WarehouseFormComponent implements OnInit {
  @Input() data: IWarehouseForm;
  @ViewChild('inputEl') inputEl: ElementRef

  public warehouseForm = new FormGroup({
    ID: new FormControl(null),
    name: new FormControl(null, Validators.required),
    fulfillmentCentre: new FormControl(false, Validators.required),
    addressID: new FormControl(null, Validators.required),
    address: new FormControl(null)
  })
  public formMode: string = 'create'
  public isLoading: boolean = false;

  constructor(
    private _modalCtrl: ModalController,
    private _modalService: ModalService,
    public util: UtilService,
    private _api: ApiService,
    public user: UserService
  ) { }

  ngOnInit() {
    if (this.data.warehouse) {
      this.formMode = "edit"
      // patch form withou trigger address change (which clears the form)
      this.warehouseForm.patchValue({
        ID: this.data.warehouse.ID,
        name: this.data.warehouse.name,
        fulfillmentCentre: this.data.warehouse.fulfillmentCentre,
        addressID: this.data.warehouse.address.ID,
        address: this.data.warehouse.address.fullAddress
      })

      this.warehouseForm.get('fulfillmentCentre').valueChanges.subscribe(value => {
        const fulfillmentCentres = this.user.account.warehouses.filter(wh => wh.fulfillmentCentre)
        if (fulfillmentCentres.length == 1 && fulfillmentCentres[0].ID == this.warehouseForm.value.ID) {
          this.warehouseForm.patchValue({fulfillmentCentre: true}, {emitEvent: false})
          this._modalService.info(`This is your only fulfillment centre. You must always have at least 1 fulfillment centre`)
        }
      })
    }


    setTimeout(() => {
      this.inputEl.nativeElement.focus()
    }, 400)
  }

  onAddressClick(action: string) {
    if (action == 'edit') {
      this._modalService.open(AddressContactPage, {address: this.data.warehouse.address, formOnly: true}).pipe(filter(res=>res)).subscribe((address: Address) => {
        this.warehouseForm.patchValue({
          address: address.fullAddress
        });
        this.data.warehouse.address = address
      })
    } else {
      this._modalService.open(AddressContactPage, { formOnly: true}).pipe(filter(res=>res)).subscribe((address: Address) => {
        this.warehouseForm.patchValue({
          addressID: address.ID,
          address: address.fullAddress
        })
      })
    }
  }

  onCancel() {
    this._modalCtrl.dismiss();
  }

  onSubmit() {
    this.util.markFormGroupDirty(this.warehouseForm)
    if (!this.warehouseForm.valid) {
      return
    }
    this.isLoading = true

    if (this.formMode == "create") {
      const body = this.warehouseForm.value
      body['accountID'] = this.user.account.ID
      this._api.createWarehouse(body).subscribe((warehouse: Warehouse) => this._modalCtrl.dismiss(warehouse, 'submit'))
    } else {
      //edit
      this._api.updateWarehouse(this.warehouseForm.value.ID, this.warehouseForm.value).subscribe((warehouse: Warehouse) => this._modalCtrl.dismiss(warehouse, 'submit'))
    }
  }
}
