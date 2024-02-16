import { Component, Input, OnInit } from '@angular/core';
import { FormGroup, FormArray, FormControl, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { forkJoin } from 'rxjs';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { UtilService } from 'src/app/core/util.service';
import { ModalService } from 'src/app/shared/modal/modal.service';
import { SaleChannel, TransactionRate } from 'src/app/shared/models/SaleChannel';

export interface IConsignmentSettings {
  saleChannelID: number
}
@Component({
  selector: 'app-consignment-settings-form',
  templateUrl: './consignment-settings-form.component.html',
  styleUrls: ['./consignment-settings-form.component.scss'],
})
export class ConsignmentSettingsFormComponent implements OnInit {
  @Input() data: IConsignmentSettings;
  public isLoading: boolean = false;

  public consignmentSettingsForm = new FormGroup({
    consignmentRates: new FormArray([])
  })

  constructor(
    private util: UtilService,
    private _api: ApiService,
    private _modalCtrl: ModalController,
    private _modalService: ModalService,
    public user: UserService
  ) { }

  ngOnInit() {
    this._api.getSaleChannelByID(this.data.saleChannelID).subscribe((saleChannel: SaleChannel) => {
      saleChannel.fees.map((fee: TransactionRate) => this.onAddTransactionRate(fee))
    })

    this.consignmentRatesArray.valueChanges.subscribe((transactionRates: TransactionRate[]) => {
      transactionRates = transactionRates.filter(record => record.minPrice != null && record.maxPrice != null)

      //min price higher than max price
      const minPriceHigherThanMaxPrice = transactionRates.filter(record => record.minPrice > record.maxPrice)
      if (minPriceHigherThanMaxPrice.length > 0) {
        this._modalService.warning(`Attention! Min price can't be higher than max price`)
      }

      const minPriceHigherThanMaxPricePrevious = transactionRates.filter((record, idx) => idx != 0 && (record.minPrice < transactionRates[idx - 1].maxPrice))
      if (minPriceHigherThanMaxPricePrevious.length > 0) {
        this._modalService.warning(`Attention! Min price can't be lowern than max price of lower tier`)
      }
    })
  }

  onAddTransactionRate(txRate?: TransactionRate) {
    this.consignmentRatesArray.push(new FormGroup({
      ID: new FormControl(txRate?.ID || null),
      minPrice: new FormControl(txRate?.minPrice || null, Validators.required),
      maxPrice: new FormControl(txRate?.maxPrice || null, Validators.required),
      value: new FormControl(txRate?.value || null, Validators.required),
      type: new FormControl(txRate?.type || 'percentage', Validators.required),
      toRemove: new FormControl(false),
    }))
  }

  get consignmentRatesArray() {
    return this.consignmentSettingsForm.get('consignmentRates') as FormArray
  }

  onToggleTransactionRateDelete(idx) {
    const currentValue = this.consignmentRatesArray.at(idx).getRawValue().toRemove
    this.consignmentRatesArray.at(idx).patchValue({toRemove: !currentValue})

    // if to remove - disable
    if (!currentValue) {
      this.consignmentRatesArray.at(idx).disable()
    } else {
      this.consignmentRatesArray.at(idx).enable()
    }
  }

  onCancel() {
    this._modalCtrl.dismiss();
  }

  onSave() {
    this.util.markFormGroupDirty(this.consignmentSettingsForm)

    if (!this.consignmentSettingsForm.valid) {
      return
    }

    this.isLoading = true

    const ratesToAdd = this.consignmentRatesArray.getRawValue().filter(record => record.ID == null && !record.toRemove)
    const ratesToUpdate = this.consignmentRatesArray.getRawValue().filter(record => record.ID != null && !record.toRemove)
    const ratesToDelete = this.consignmentRatesArray.getRawValue().filter(record => record.ID != null && record.toRemove)


    const queries = []
    if (ratesToAdd.length > 0) {
      queries.push(this._api.createSaleChannelConsignmentFees(this.data.saleChannelID, ratesToAdd))
    }

    if (ratesToUpdate.length > 0) {
      queries.push(this._api.updateSaleChannelConsignmentFees(this.data.saleChannelID, ratesToUpdate))
    }

    if (ratesToDelete.length > 0) {
      ratesToDelete.map(rate => queries.push(this._api.deleteSaleChannelConsignmentFees(this.data.saleChannelID, rate.ID)))
    }

    forkJoin(queries).subscribe(data => {
      this._modalService.success(`Consignment Rates Updated`)
      this._modalCtrl.dismiss(data, 'submit')
    })

  }
}
