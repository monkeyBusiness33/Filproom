import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin,  Subscription } from 'rxjs';
import {map, mergeMap, filter, tap} from 'rxjs/operators';
import { ApiService } from 'src/app/core/api.service';
import { AuthService } from 'src/app/core/auth.service';
import { UserService } from 'src/app/core/user.service';
import { UtilService } from 'src/app/core/util.service';
import { SaleChannelFormComponent } from 'src/app/sale-channels/modals/sale-channel-form/sale-channel-form.component';
import { WarehouseFormComponent } from 'src/app/shared/components/warehouse-form/warehouse-form.component';
import { ChangePasswordComponent } from 'src/app/shared/components/change-password/change-password.component';
import { ModalService } from 'src/app/shared/modal/modal.service';
import { Address } from 'src/app/shared/models/Address.model';
import { SaleChannel } from 'src/app/shared/models/SaleChannel';
import { User } from 'src/app/shared/models/User.model';
import { Warehouse } from 'src/app/shared/models/Warehouse.model';
import { environment } from 'src/environments/environment';
import {AddressContactPage, Country} from "../../orders/modals/address-contact/address-contact.page";
import { PluginsService } from 'src/app/core/plugins.service';
import {FeedbackInterfaceComponent} from "../../shared/modal/feedback-interface/feedback-interface.component";
import {AnalyticsService} from "../../core/analytics.service";

@Component({
  selector: 'app-account',
  templateUrl: './account.page.html',
  styleUrls: ['./account.page.scss'],
})
export class AccountPage implements OnInit {
  @ViewChild('popover') popover;
  isOpen = false;
  /**
   * TODO:
   * account address
   * account taxRate
   * account billingAddress
   * phoneNumber:
   *  - problem with updating it. Can't use the form because updates customer, but the phone number is linked to the user
   *  - alternatively, I would have to define the logic here in the component
   *
   */
  public prefersDarkMode: boolean = window.matchMedia('(prefers-color-scheme: dark)').matches
  public env = environment
  public isLoading = false
  private subs: Subscription[] = []

  public generalForm = new FormGroup({
    accountName: new FormControl(null, Validators.required),
    accountLogoUrl: new FormControl(null),
    newLogoBase64: new FormControl(null),
    currency: new FormControl(null, Validators.required),
    name: new FormControl(null),
    surname: new FormControl(null),
    password: new FormControl(null),
    confirmPassword: new FormControl(null),
    apiKey: new FormControl(null),
    phoneCountryCode: new FormControl(),
    phoneNumber: new FormControl({value: null, disabled: true}, Validators.pattern("[0-9]{10}")),
    sizeChartConfigs: new FormControl(),
  }, [GeneralFormValidator])
  public countriesList: Country[] = []

  public invoicingForm = new FormGroup({
    vatNumber: new FormControl(null, Validators.required),
    taxRate: new FormControl(null, Validators.required),
    billingAddressID: new FormControl(null, Validators.required),
    billingAddress: new FormControl(null, Validators.required),
  })


  public accountSaleChannels = []

  public warehousesAvailable: Warehouse[] = []

  public advancedServicesForm = new FormGroup({
    warehousing: new FormControl(null, Validators.required),
    transfer: new FormControl(null, Validators.required),
  })

  public isLoadingBarcodeGeneration: boolean = false

  //PRODUCT CONFIG VARS
  public sizeCharts = ['uk','eu','us','jp']

  constructor(
    private _modalCtrl: ModalService,
    private _api: ApiService,
    private _auth: AuthService,
    public user: UserService,
    private _route: ActivatedRoute,
    private _router: Router,
    private utils: UtilService,
    private _authApi: AuthService,
    private _plugins: PluginsService,
    private _analytics: AnalyticsService
  ) { }

  ngOnInit() {
    this.subs.map(sub => sub.unsubscribe())
    this._api.loadCountries().subscribe((countries: Country[]) => this.countriesList = countries)

    this.generalForm.patchValue({
      accountName: this.user.account.name,
      accountLogoUrl: this.user.account.logoUrl,
      currency: this.user.account.currency,
      name: this.user.name,
      surname: this.user.surname,
      password: this.user.password,
      confirmPassword: this.user.password,
      apiKey: this.user.apiKey,
      phoneCountryCode: this.user.phoneCountryCode,
      phoneNumber: this.user._phoneNumber,
      sizeChartConfigs: this.user.account.sizeChartConfig
    })

    this.user._phoneNumber != null ? this.generalForm.get('phoneNumber').enable() : null
    // Listen for changes to phone country code
    this.subs.push(this.generalForm.get('phoneCountryCode').valueChanges.subscribe(value => {
      if(value) {
        this.generalForm.get('phoneNumber').enable()
      } else {
        this.generalForm.get('phoneNumber').disable()
      }

      //clear the fields every time the phone country code changes
      this.generalForm.patchValue({
        phoneNumber: null
      })
    }))

    this.invoicingForm.patchValue({
      vatNumber: this.user.account.vatNumber,
      taxRate: this.user.account.taxRate,
      billingAddressID: this.user.account.billingAddress? this.user.account.billingAddress.ID: null,
      billingAddress: this.user.account?.billingAddress
    })

    this.warehousesAvailable = this.user.account.warehouses

    this.advancedServicesForm.patchValue({
      warehousing: this.user.iam.service.warehousing,
      transfer: this.user.iam.service.transfer
    })

    this.accountSaleChannels = this.user.account.saleChannels.filter(sc => sc.accountID == this.user.account.ID)

    if (!this.user.iam.account.edit) {
      this.generalForm.get('accountName').disable()
      this.generalForm.get('accountLogoUrl').disable()
      this.generalForm.get('currency').disable()
      this.generalForm.get('accountName').disable()
      this.invoicingForm.disable()
      this.advancedServicesForm.disable()
    }
  }

  ionViewDidEnter() {
  }

  onSignOut () {
    this._authApi.signOut()
    this._router.navigate(['/signin'], {replaceUrl: true})
  }

  onLogoImageUploaded(evt) {
    if (!this.user.iam.account.edit) {
      return
    }

    const file = evt.target.files[0]
    //Preview the new logo
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string // Logs data:<type>;base64,wL2dvYWwgbW9yZ...
      this.generalForm.patchValue({accountLogoUrl: base64})
      this.generalForm.patchValue({newLogoBase64: base64.slice(base64.indexOf('base64,') + 7)})
      this.generalForm.markAsDirty()
    };
    reader.readAsDataURL(file);
  }

  onCopyApiKey() {
    navigator.clipboard.writeText(this.user.apiKey);
    this._modalCtrl.info('API Key copied to clipboard')
  }

  onRefreshApiKey() {
    this._modalCtrl.confirm("Refreshing your API key will break any other program that communicate with our API. Do you wish to continue and refresh your API Key?")
      .pipe(
        filter(res => res),
        mergeMap(() => this._api.refreshAPIKey(this.user.ID)),
        mergeMap(() => this._modalCtrl.alert('You need to sign back in for the changes to take effect')),
      )
      .subscribe(() => this._auth.signOut(true))
  }

  onToggleDarkMode() {
    this.prefersDarkMode = !this.prefersDarkMode
    document.body.classList.toggle('dark-theme', this.prefersDarkMode);
  }

  /**
   * SIZE CHART SETTINGS
   */

  selectSizeChart(e: Event) {
    this.popover.event = e;
    this.isOpen = true;
  }

  addSizeChart(chart) {
    this.generalForm.markAsDirty()
    const updatedCharts = this.selectedSizeCharts
    updatedCharts.push(chart)
    this.generalForm.get('sizeChartConfigs').setValue(updatedCharts)
  }

  removeSizeChart(index) {
    console.log('enter')
    this.generalForm.markAsDirty()
    const updatedCharts = this.selectedSizeCharts
    updatedCharts.splice(index, 1)
    this.generalForm.get('sizeChartConfigs').setValue(updatedCharts)
  }

  // compute difference between selected charts and available ones
  get availableCharts(){
    const availableCharts = []
    this.sizeCharts.map(chart => {
      if (this.selectedSizeCharts.indexOf(chart) == -1){availableCharts.push(chart)}
    })
    return availableCharts
  }

  //shift order
  drop(event: CdkDragDrop<string[]>) {
    this.generalForm.markAsDirty()
    let currentCharts = this.selectedSizeCharts
    moveItemInArray(currentCharts, event.previousIndex, event.currentIndex);

  }

  get selectedSizeCharts() : string[]{
    return this.generalForm.get('sizeChartConfigs').value
  }


  onDeleteAccountRequest() {
    let deleteReasonsData  =  {title: "We'd hate to see you go!", id: 'delete-account-reasons', reasons: [
        "The app is too difficult to use",
        "I have too many platforms to keep track of",
        "I cannot find products that I want to sell",
        "I am selling better on other platforms",
        "I cannot remove my stock once it has sold elsewhere",
        "I have sold all my stock and I do not need this account anymore",
        "I am not getting paid by the consignment store",
        "Other",
      ],
      mode: 'poll'
    };
    this._analytics.trackEvent('delete-account-request', {})
    this._modalCtrl.open(FeedbackInterfaceComponent, deleteReasonsData, {})
      .pipe(
        filter(res => res),
        mergeMap(res => {
          this._analytics.trackEvent('warning-1-viewed', {warningId: 'delete-account'})
          return this._modalCtrl.confirm("Are you sure you want to delete your account? This action can't be undone.");
        }),
        filter(res => res),
        mergeMap((res) => {
          this._analytics.trackEvent('warning-2-viewed', {warningId: 'delete-account'})
          return this._modalCtrl.confirm("All your stock and sales information will be lost forever!");
        }),
        filter(res => res),
        mergeMap(() => {
          this._analytics.trackEvent('warning-action', {awarningId: 'delete-account', action: 'delete-account'})
          this.isLoading = true;
          return this._api.deleteAccount(this.user.account.ID);
        }),
        tap(() => {
          this.isLoading = false;
        })
      )
      .subscribe(() => {
        this._modalCtrl.info("We received your request to delete the account. You will be notified once this is done");
      }, error => {
        this.isLoading = false;
        console.error("Error occurred:", error);
      });
  }

  onBillingAddressClick() {
    if (!this.user.iam.account.edit) {
      return
    }

    const data = {
      address: this.invoicingForm.value.billingAddress,
      formOnly: true
    }

    this._modalCtrl.open(AddressContactPage, data).pipe(filter(res => res)).subscribe((address: Address) => {
      this.invoicingForm.patchValue({
        billingAddressID: address.ID,
        billingAddress: address,
      })
      this.invoicingForm.markAsDirty()
    })
  }

  onOpenSaleChannel(saleChannel: SaleChannel) {
    this._modalCtrl.open(SaleChannelFormComponent, {saleChannel: saleChannel}, {cssClass: 'full-screen-y'}).pipe(
      mergeMap(() => {
        this.isLoading = true
        return this._api.getAccountInfo()
      })
    ).subscribe((user) => {
      this.ngOnInit()
      this.isLoading = false
    })

  }

  onCreateSaleChannel() {
    this._modalCtrl.actionSheet('Select Platform', [
      {title: 'store', key: 'store'},
      {title: 'shopify', key: 'shopify'},
    ]).pipe(
      filter(resp => resp.role == "submit"),
      mergeMap(resp => this._modalCtrl.open(SaleChannelFormComponent, {saleChannel: {platform: resp.data}}, {cssClass: 'full-screen-y'})),
      mergeMap((saleChannel: SaleChannel) => this._api.getAccountInfo())
    )
    .subscribe(resp => this.ngOnInit())
  }

  onEditWarehouse(warehouse: Warehouse) {
    this._modalCtrl.open(WarehouseFormComponent, {warehouse: warehouse}).pipe(
      mergeMap(() => {
        this.isLoading = true
        return this._api.getAccountInfo()
      })
    ).subscribe((user) => {
      this.ngOnInit()
      this.isLoading = false
    })
  }

  onChangePassword(){
    this._modalCtrl.open(ChangePasswordComponent).pipe(
      mergeMap(() => {
        this.isLoading = true
        return this._api.getAccountInfo()
      })
    ).subscribe((user) => {
      this.ngOnInit()
      this.isLoading = false
    })
  }

  onAddWarehouse() {
    this._modalCtrl.open(WarehouseFormComponent).pipe(
      mergeMap(() => {
        this.isLoading = true
        return this._api.getAccountInfo()
      })
    ).subscribe((user) => {
      this.ngOnInit()
      this.isLoading = false
    })
  }

  onToggleService(serviceName: string) {
    if (serviceName == 'warehousing') {
      // if service warejousing now enabled
      if (this.user.iam.service.warehousing) {
        console.log("removing permissions")
        this.advancedServicesForm.patchValue({ warehousing: true })
        this._modalCtrl.input({title: 'confirm', subtitle: "Enter <b>DISABLE</b> to disable the warehousing service", type: 'string'}).pipe(
          map(resp => {
            resp = `${resp}`.toLowerCase()
            if (resp != "disable") {
              this.advancedServicesForm.patchValue({warehousing: true})
            }
            return resp
          }),
          filter(resp => resp == "disable"),
          mergeMap(() => this._api.removePermissions(['service.warehousing', 'purchase.view'])),
          mergeMap(() => this._modalCtrl.alert('You need to sign back in for the changes to take effect')),
        ).subscribe(() => this._auth.signOut(true))
      } else {
        console.log("adding permissions")
        this.advancedServicesForm.patchValue({ warehousing: false })
        this._modalCtrl.input({title: 'confirm', subtitle: "Enter <b>ENABLE</b> to enable the warehousing service", type: 'string'}).pipe(
          map(resp => {
            resp = `${resp}`.toLowerCase()
            if (resp != "enable") {
              this.advancedServicesForm.patchValue({warehousing: false})
            }
            return resp
          }),
          filter(resp => resp == "enable"),
          mergeMap(() => this._api.addPermissions(['service.warehousing', 'purchase.view'])),
          mergeMap(() => this._modalCtrl.alert('You need to sign back in for the changes to take effect')),
        ).subscribe(() => this._auth.signOut(true))
      }
    }

    if (serviceName == 'transfer') {
      // if service warejousing now enabled
      if (this.user.iam.service.transfer) {
        console.log("removing permissions")
        this.advancedServicesForm.patchValue({ transfer: true })
        this._modalCtrl.input({title: 'confirm', subtitle: "Enter <b>DISABLE</b> to disable the transfer service", type: 'string'}).pipe(
          map(resp => {
            resp = `${resp}`.toLowerCase()
            if (resp != "disable") {
              this.advancedServicesForm.patchValue({transfer: true})
            }
            return resp
          }),
          filter(resp => resp == "disable"),
          mergeMap(() => this._api.removePermissions(['service.transfer'])),
          mergeMap(() => this._modalCtrl.alert('You need to sign back in for the changes to take effect')),
        ).subscribe(() => this._auth.signOut(true))
      } else {
        console.log("adding permissions")
        this.advancedServicesForm.patchValue({ transfer: false })
        this._modalCtrl.input({title: 'confirm', subtitle: "Enter <b>ENABLE</b> to enable the transfer service", type: 'string'}).pipe(
          map(resp => {
            resp = `${resp}`.toLowerCase()
            if (resp != "enable") {
              this.advancedServicesForm.patchValue({transfer: false})
            }
            return resp
          }),
          filter(resp => resp == "enable"),
          mergeMap(() => this._api.addPermissions(['service.transfer'])),
          mergeMap(() => this._modalCtrl.alert('You need to sign back in for the changes to take effect')),
        ).subscribe(() => this._auth.signOut(true))
      }
    }
  }

  onGenerateItemBarcodes(evt) {
    const qty = evt.value || 0
    if (qty < 1) {
      this._modalCtrl.warning('Min batch size: 1')
    } else if (qty > 100) {
      this._modalCtrl.warning('Max batch size: 100')
    } else {
      this.isLoadingBarcodeGeneration = true
      this._api.generateItemsBarcodes(qty).subscribe((data) => {
        this.isLoadingBarcodeGeneration = false
        this._modalCtrl.success('Barcodes Generated')
        const blob = new Blob([data], {type: 'application/pdf'})

        const _plugins = this._plugins
        var reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = function() {
          var base64data = reader.result as string
          _plugins.printPDF(base64data, `barcodes_${qty}_${new Date().getTime()}.pdf`)
        }
      })
    }
  }

  onSaveChanges() {
    this.isLoading = true
    const accountUpdates = {}
    const userUpdates = {}

    if (!this.generalForm.pristine) {
      accountUpdates['name'] = this.generalForm.value.accountName
      accountUpdates['currency'] = this.generalForm.value.currency
      accountUpdates['sizeChartConfigs'] = this.generalForm.value.sizeChartConfigs.join()
      userUpdates['name'] = this.generalForm.value.name
      userUpdates['surname'] = this.generalForm.value.surname
      userUpdates['phoneCountryCode'] = this.generalForm.value.phoneCountryCode
      userUpdates['phoneNumber'] = this.generalForm.value.phoneNumber


      if (this.generalForm.value.newLogoBase64) {
        accountUpdates['logoBase64'] = this.generalForm.value.newLogoBase64
      }

      if (!this.generalForm.get('confirmPassword').pristine && this.generalForm.get('confirmPassword').errors.matchingPasswords) {
        userUpdates['password'] = this.generalForm.value.password
      }
    }

    if (!this.invoicingForm.pristine) {
      accountUpdates['vatNumber'] = this.invoicingForm.value.vatNumber
      accountUpdates['taxRate'] = this.invoicingForm.value.taxRate
      accountUpdates['billingAddressID'] = this.invoicingForm.value.billingAddressID
    }

    const updatesQueries = []
    if (Object.keys(accountUpdates).length != 0) {
      updatesQueries.push(this._api.updateAccount(this.user.account.ID, accountUpdates))
    }
    if (Object.keys(userUpdates).length != 0) {
      updatesQueries.push(this._api.updateUser(this.user.ID, userUpdates))
    }

    forkJoin(updatesQueries).pipe(
      mergeMap(() => this._api.getAccountInfo())
    ).subscribe((user) => {
      this.ngOnInit()
      this.isLoading = false

      if (userUpdates['password'] != undefined) {
        this._modalCtrl.alert('Password Changed. Please Sign In again').subscribe(() => this._auth.signOut())
      }

      this.generalForm.markAsPristine()
      this.invoicingForm.markAsPristine()
      this.advancedServicesForm.markAsPristine()

      this._modalCtrl.success('Settings Updated')
    })
  }

}

const GeneralFormValidator: ValidatorFn = (fg: FormGroup) => {
  fg.get('confirmPassword').setErrors({ 'matchingPasswords':  fg.get('password').value == fg.get('confirmPassword').value})
  return null
}
