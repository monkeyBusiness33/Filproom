import { Component, Input, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { ApiService } from 'src/app/core/api.service';
import { Account } from 'src/app/core/user.service';
import { UtilService } from 'src/app/core/util.service';
import { ModalService } from 'src/app/shared/modal/modal.service';
import { SaleChannel } from 'src/app/shared/models/SaleChannel';
import { User } from 'src/app/shared/models/User.model';

export interface IConsignorForm {
  consignor: Account
  saleChannel: SaleChannel
}

@Component({
  selector: 'app-consignor-form',
  templateUrl: './consignor-form.component.html',
  styleUrls: ['./consignor-form.component.scss'],
})
export class ConsignorFormComponent implements OnInit {
  @Input() data: IConsignorForm;
  public isLoading: boolean = false

  public consignorInfo = {
    'name': '',
    'email': '',
    'phoneNumber': '',
    'lastVisitAt': null
  }
  public tierNames: string[] = ['bronze', 'silver', 'gold']
  public consignorConfigForm = new FormGroup({
    tier: new FormControl(null),
    status: new FormControl(null),
  })

  constructor(
    private _api: ApiService,
    private util: UtilService,
    private _modalCtrl: ModalController,
    private _modalService: ModalService
  ) { }

  ngOnInit() {
    this.isLoading = true
    this._api.getAccountUsers(0, 99999, 'name:asc', {accountID: this.data.consignor.ID, apiKey: '!*'}).subscribe((resp) => {
      this.consignorInfo.name = resp.data[0].fullName
      this.consignorInfo.email = resp.data[0].email
      this.consignorInfo.phoneNumber = resp.data[0].phoneNumber
      this.consignorInfo.lastVisitAt = resp.data[0].lastVisitAt
      this.isLoading = false
    })
    this.consignorConfigForm.patchValue({
      tier: this.data.consignor.saleChannels[0].tier,
      status: this.data.consignor.saleChannels[0].status
    })
  }

  get consignorConfigFormData() {
    return this.consignorConfigForm.getRawValue()
  }

  onCancel() {
    this._modalCtrl.dismiss()
  }

  onSave() {
    this.util.markFormGroupDirty(this.consignorConfigForm)
    if (!this.consignorConfigForm.valid) {
      return
    }
    this.isLoading = true

    const updates = {
      tier: this.consignorConfigFormData.tier,
    }

    if (this.consignorConfigForm.get('status').touched) {
      updates['status'] = this.consignorConfigFormData.status
    }

    this._api.updateSaleChannelConsignor(this.data.saleChannel.ID, this.data.consignor.ID, updates).subscribe((account: Account) => {
      this._modalService.success(`Consignor Updated`)
      this._modalCtrl.dismiss(account, 'submit')
    })

  }
}
