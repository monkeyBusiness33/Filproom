import { Component, Input, OnInit } from '@angular/core';
import { FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { UtilService } from 'src/app/core/util.service';
import * as ClassicEditor from '@ckeditor/ckeditor5-build-classic';
import { ModalService } from '../../../shared/modal/modal.service';
import { Address } from '../../../shared/models/Address.model';
import { SaleChannel, TransactionRate } from '../../../shared/models/SaleChannel';
import { Warehouse } from '../../../shared/models/Warehouse.model';
import { Router } from '@angular/router';
import { environment } from 'src/environments/environment';
import { ConsignmentSettingsFormComponent } from 'src/app/sale-channels/modals/consignment-settings-form/consignment-settings-form.component';
import {AddressContactPage} from "../../../orders/modals/address-contact/address-contact.page";
import {filter, mergeMap, switchMap} from "rxjs/operators";
import {of} from "rxjs";

export interface ISaleChannelForm {
  saleChannel: SaleChannel
}

export interface IStripeAccount {
  payouts_enabled: boolean
  balance: {
    available: {
      amount: number
      currency: string
    }
  }
  email: string
  externalAccounts: {
    data: IStripeAccountExternal[]
  }
}

export interface IStripeAccountExternal {
  id: string
  account: string
  bank_name: string
  last4: string
}

@Component({
  selector: 'app-sale-channel-form',
  templateUrl: './sale-channel-form.component.html',
  styleUrls: ['./sale-channel-form.component.scss'],
})
export class SaleChannelFormComponent implements OnInit {
  @Input() data: ISaleChannelForm;

  public environment = environment
  public Editor = ClassicEditor;
  public editorConfig: any = {
    resize_enabled: true,
  };

  public saleChannelForm = new FormGroup({
    ID: new FormControl(null),
    account: new FormControl(null, Validators.required),
    platform: new FormControl(null, Validators.required),
    email: new FormControl({ value: null, disabled: true }, [Validators.required, Validators.email]),
    password: new FormControl({ value: null, disabled: true }, Validators.required),
    title: new FormControl(null, Validators.required),
    description: new FormControl(null),
    markup: new FormControl(0, Validators.required),
    taxRate: new FormControl(0, Validators.required),
    shopifyAPIAuth: new FormControl(null),
    shopifyStoreName: new FormControl(null),
    policyUrl: new FormControl(null),
    allowVirtualInventory: new FormControl(false, Validators.required),
    fees: new FormControl([]),
    tier: new FormControl(null) // only for display purposes
  })
  public isLoading: boolean = false;
  public stripeAccount: IStripeAccount;
  public buttons = [

  ]

  constructor(
    private _modalCtrl: ModalController,
    private _modalService: ModalService,
    public util: UtilService,
    private _api: ApiService,
    public user: UserService,
    private _router: Router
  ) { }

  ngOnInit() {
    this.saleChannelForm.valueChanges.subscribe(value => this.onFormStateChange())
    // create
    if (this.data.saleChannel?.ID) {
      this.onRefresh()
    } else { //edit
      this.saleChannelForm.patchValue({
        account: this.user.account,
        platform: this.data.saleChannel.platform
      })
    }

    // enable email and password if platform is laced
    if (this.data.saleChannel.platform == 'laced') {
      this.saleChannelForm.patchValue({
        platform: this.data.saleChannel.platform,
        title: this.data.saleChannel.platform,
      })
      this.saleChannelForm.get('email').enable()
      this.saleChannelForm.get('password').enable()
      return
    }


    if (this.user.account.stripeAccountID) {
      console.log(`Stripe account - linked`)
      this.isLoading = true
      this._api.getStripeAccount(this.user.account.ID).subscribe((resp) => {
        this.stripeAccount = resp
        this.isLoading = false
      })
    }

    //Parse shopify api key url
    this.saleChannelForm.get('shopifyAPIAuth').valueChanges.subscribe((shopifyAPIURLUnformatted: string) => {
      //expected string to parse: https://{apikey}:{password}@{hostname}/admin/api/{version}/{resource}.json
      if ((shopifyAPIURLUnformatted || '').length == 0 || !shopifyAPIURLUnformatted.includes('.myshopify.com')) {
        this.saleChannelForm.patchValue({
          shopifyAPIAuth: null,
          shopifyStoreName: null,
        }, {emitEvent: false})
        return
      }
      const [_, storeName] = shopifyAPIURLUnformatted.match(new RegExp('@' + "(.*)" + '.myshopify.com'))
      if (storeName.length == 0) {
        this._modalService.warning('Invalid API Url')
        return
      }
      const cleanString = shopifyAPIURLUnformatted.substring(0, shopifyAPIURLUnformatted.indexOf(storeName) + storeName.length)

      this.saleChannelForm.patchValue({
        shopifyStoreName: storeName,
        shopifyAPIAuth:  `${cleanString}.myshopify.com/admin/api/2021-04/`
      }, {emitEvent: false})
    })
  }

  onRefresh() {
    this.buttons = []
    this._api.getSaleChannelByID(this.data.saleChannel.ID).subscribe((saleChannel: SaleChannel) => {
      this.saleChannelForm.patchValue(saleChannel)
      this.saleChannelForm.patchValue({
        tier: saleChannel.tier
      }, {emitEvent: false})

      if (this.saleChannelFormData.account.ID == this.user.account.ID) {
        this.buttons.push({label: 'view consignors', icon: 'group', id: 'view-consignors'})
      }
      this.isLoading = false
    })
  }

  onFormStateChange() {
    //if platform == shopify - shopify api key is required
    if (this.saleChannelFormData.platform == 'shopify') {
      this.saleChannelForm.get('shopifyAPIAuth').addValidators(Validators.required);
      this.saleChannelForm.get('shopifyAPIAuth').updateValueAndValidity({emitEvent: false});
      this.saleChannelForm.get('shopifyStoreName').addValidators(Validators.required);
      this.saleChannelForm.get('shopifyStoreName').updateValueAndValidity({emitEvent: false});
    }

    const fixes = {}
    if (this.saleChannelFormData.markup < 0) {
      fixes['markup'] = 0
    } else if (this.saleChannelFormData.markup > 99) {
      fixes['markup'] = 99
    }

    if (this.saleChannelFormData.taxRate < 0) {
      fixes['taxRate'] = 0
    } else if (this.saleChannelFormData.taxRate > 99) {
      fixes['taxRate'] = 99
    }

    this.saleChannelForm.patchValue(fixes, {emitEvent: false})
  }

  onCancel() {
    this._modalCtrl.dismiss();
  }

  get saleChannelFormData() {
    return this.saleChannelForm.getRawValue()
  }

  onAllowVirtualInventoryToggle(isChecked: boolean) {
    this.saleChannelForm.patchValue({
      allowVirtualInventory: isChecked
    }, {emitEvent: false})
  }

  computeListingPrice(): number {
    let listingPrice = 100 * 100 / (100 - this.saleChannelFormData.markup);
    listingPrice = listingPrice * (1 + this.saleChannelFormData.taxRate / 100)
    listingPrice = Math.floor(listingPrice)
    return listingPrice
  }

  onConsignmentFeesClick() {
    this._modalService.open(ConsignmentSettingsFormComponent, {saleChannelID: this.saleChannelFormData.ID})
    .subscribe(() => this.onRefresh())
  }

  onLinkStripeClick(linkName: string) {
    //used to generate the onboarding link for a new account
    this._api.getStripeLinks(this.user.account.ID, linkName, {}).subscribe((linkUrl) => {
      window.open(linkUrl, '_blank');
    })
  }

  getFulfillmentCentre(): Warehouse {
    return this.user.account.warehouses.find(wh => wh.fulfillmentCentre)
  }

  onAddressClick() {
    const fulfillmentCentre = this.getFulfillmentCentre()
    if (fulfillmentCentre.address?.ID) {
      this._modalService.open(AddressContactPage, {address: fulfillmentCentre.address, formOnly:true}).pipe(filter(res=>res)).subscribe((address: Address) => this._modalService.success('Address Updated. Refresh the page to see the changes'))
    } else {
      this._modalService.open(AddressContactPage).pipe(filter(res=>res)).subscribe((address: Address) => this._modalService.success('Address Added. Refresh the page to see the changes'))
    }
  }

  onSubmit() {
    this.util.markFormGroupDirty(this.saleChannelForm)
    if (!this.saleChannelForm.valid) {
      return
    }
    this.isLoading = true

    //UPDATE
    if (this.saleChannelFormData.ID) {
      const updates = {
        title: this.saleChannelFormData.title,
        description: this.saleChannelFormData.description,
        allowVirtualInventory: this.saleChannelFormData.allowVirtualInventory,
        markup: this.saleChannelFormData.markup,
        taxRate: this.saleChannelFormData.taxRate,
        policyUrl: this.saleChannelFormData.policyUrl,
      }
      console.log("updates: ",updates);
      console.log("this.saleChannelFormData.policyUrl,: ", this.saleChannelFormData.policyUrl,);
      this._api.updateSaleChannel(this.saleChannelFormData.ID, updates).subscribe((saleChannel: SaleChannel) => {
        this.isLoading = false
        this._modalService.success('Sale Channel Updated')
        this._modalCtrl.dismiss(saleChannel, 'submit')
      })
    }
    //CREATION
    else {
      const body = {
        title: this.saleChannelFormData.title,
        description: this.saleChannelFormData.description,
        platform: this.saleChannelFormData.platform,
        email: this.saleChannelFormData.email,
        password: this.saleChannelFormData.password,
        allowVirtualInventory: this.saleChannelFormData.allowVirtualInventory,
        markup: this.saleChannelFormData.markup,
        taxRate: this.saleChannelFormData.taxRate,
        policyUrl: this.saleChannelFormData.policyUrl,
        shopifyStoreName: this.saleChannelFormData.shopifyStoreName,
        shopifyAPIAuth: this.saleChannelFormData.shopifyAPIAuth
      }

      /**
       *   PRE-CREATION SALE CHANNEL VALIDATION :
       *   A: Laced -> make sure the credentials are valid and laced account is complete
       *   B: Standard -> NO VALIDATION
       *   TODO C: Shopify -> make sure the api key is valid
       *
       */

      let validationRequest = this.saleChannelFormData.platform == 'laced' ? this._api.validateLacedCredentials(body.email, body.password) : of({valid: true, message: null})
      validationRequest.pipe(
        mergeMap((validationResponse: { valid:boolean, message:string }) => {
          if (!validationResponse.valid) {
            this.isLoading = false
            this._modalService.warning(validationResponse.message)
            return of(null)
          }
          return this._api.createSaleChannel(body)
        }
      ), filter(resp => resp))
      .subscribe((saleChannel: SaleChannel) => {
        this.isLoading = false
        this._modalService.success('Sale Channel Created')
        this._modalCtrl.dismiss(saleChannel, 'submit')
      })
    }
  }

  onButtonClick(buttonId: string) {
    if (buttonId == 'view-consignors') {
      this._router.navigate([`/sale-channels/${this.saleChannelFormData.ID}/consignors`])
      this._modalCtrl.dismiss()
    }
  }
  onOpenPolicy(){
    window.open(this.saleChannelFormData.policyUrl,'_blank')
  }
}
