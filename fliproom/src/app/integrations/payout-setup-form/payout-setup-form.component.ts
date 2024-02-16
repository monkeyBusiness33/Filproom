import { Component, Input, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { filter } from 'rxjs/operators';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { AddressContactPage } from 'src/app/orders/modals/address-contact/address-contact.page';
import { ModalService } from 'src/app/shared/modal/modal.service';
import { environment } from 'src/environments/environment';

export interface IPayoutSetupForm {
  retailerAccountID: number
}

@Component({
  selector: 'app-payout-setup-form',
  templateUrl: './payout-setup-form.component.html',
  styleUrls: ['./payout-setup-form.component.scss'],
})
export class PayoutSetupFormComponent implements OnInit {
  public environment = environment
  public isLoading: boolean = false; //loading data
  public isLoadingAction: boolean = false; //loading button
  public address;
  public consignorAccountID;
  @Input() data: IPayoutSetupForm

  public payoutSetupForm = new FormGroup({
    accountNumber: new FormControl(null, [Validators.required, Validators.maxLength(8), Validators.minLength(8)]),
    sortCode: new FormControl(null, [Validators.required, Validators.maxLength(6), Validators.minLength(6)]),
    companyName: new FormControl(null, Validators.required),
    address: new FormControl(null, Validators.required)
  })

  constructor(
    private _modalCtrl: ModalController,
    private _api: ApiService,
    private _user: UserService,
    private _modal: ModalService,
  ) {
    this.consignorAccountID = this._user.account.ID;
  }

  ngOnInit() {}

  onCreateAddress() {
    this._modal.open(AddressContactPage, { formOnly: true, maskFields: ['name', 'surname', 'email', 'phoneNumber', 'phoneCountryCode']  }).pipe(
      filter(res => res)
    ).subscribe((address: any) => {
      console.log('Address',address)
      this.address = address;
      this.payoutSetupForm.get('address').setValue(address.fullAddress);
      this._modal.success('Address Loaded')
    })
  }

  onSubmit(){
    let body = {
      "gateway": "revolut",
      "accountID": this.data.retailerAccountID,
      "companyName": this.payoutSetupForm.controls['companyName'].value,
      "sortCode": this.payoutSetupForm.controls['sortCode'].value,
      "accountNumber": this.payoutSetupForm.controls['accountNumber'].value,
      "address": {
        "street_line1": this.address.address,
        "postcode": this.address.postcode,
        "city": this.address.city,
        "country": (this.address.countryCode).toUpperCase()
      }
    }
    this._api.createBankAccount(this.data.retailerAccountID, this.consignorAccountID,body).subscribe(res => {
      this._modal.success('Payout Account Created')
      this._modalCtrl.dismiss(res, 'submit')
    })
  }

  onBack() {
    this._modalCtrl.dismiss()
  }

}
