import {Component, ElementRef, Input, OnInit, ViewChild, OnDestroy} from '@angular/core';
import {ApiService, GooglePlace, GooglePlaceAutocompletePrediction} from "../../../core/api.service";
import {ModalController} from "@ionic/angular";
import {ModalService} from "../../../shared/modal/modal.service";
import {Router} from "@angular/router";
import {UserService} from "../../../core/user.service";
import {environment} from 'src/environments/environment';
import {FliproomListComponent} from "../../../shared/fliproom-list/fliproom-list.component";
import {debounceTime, filter, mergeMap, tap} from "rxjs/operators";
import {merge, Subscription} from "rxjs";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {Address} from "../../../shared/models/Address.model";
import {UtilService} from "../../../core/util.service";
import {Product} from "../../../shared/models/Product.model";

export interface Country {
  country: string
  code: string
  iso: string
}

export interface IAddressForm {
  address: Address,
  formOnly: boolean,
  maskFields: string[] | null,
  bypassBackendRequest?: boolean, // If set to true, return the address form value without making an API request to update the address value in the DB
  guestJWT?: string, // Guest JWT token used to create the address when the user is not logged in.
  disableCreate?: boolean, // Disable the address creation when it is set to true.
  disableEdit?: boolean, // Disable the address edition when it is set to true.
  disableSelect?: boolean, // Disable the address selection when it is set to true.
  disableDisplayValidationTag?: boolean, // Hide the validation tag when it is set to true.
}

@Component({
  selector: 'app-address-contact',
  templateUrl: './address-contact.page.html',
  styleUrls: ['./address-contact.page.scss'],
})


export class AddressContactPage implements OnInit, OnDestroy {



  public dataRequested = null;
  public environment = environment;
  @Input() data: IAddressForm
  @ViewChild('fliproomList') fliproomList: FliproomListComponent;
  @ViewChild('inputEl') inputEl: ElementRef

  public formMode: string = "create"; // enum: [create, edit]
  public countriesList: Country[] = []
  public filteredAddressObjects: GooglePlaceAutocompletePrediction[] = []
  public activeSubs: Subscription[] = []
  public isLoading: boolean = false;
  public isValidating: boolean = false;
  public isAddressValidationNeeded: boolean = false;
  public fieldsMasked: string[] = [] // stores the field names to not display in the form - possible list of values: 'name', 'surname', 'email', 'phoneNumber', 'address'

  public addressForm = new FormGroup({
    ID: new FormControl(),
    name: new FormControl(null,Validators.required),
    surname: new FormControl(null),
    email: new FormControl(null, Validators.email),

    country: new FormControl(null),
    countryCode: new FormControl(),
    county:    new FormControl(),
    countyCode: new FormControl(),
    address: new FormControl({value: null, disabled: true}),
    addressExtra: new FormControl({value: null, disabled: true}),
    postcode: new FormControl({value: null, disabled: true}),
    city: new FormControl({value: null, disabled: true}),
    validated: new FormControl(null),

    phoneCountryCode: new FormControl(),
    phoneNumber: new FormControl({value: null, disabled: true}, Validators.pattern("[0-9]{10}")),
  })

  constructor(
    private _api: ApiService,
    private _modalCtrl: ModalController,
    private _modal: ModalService,
    private _router: Router,
    private _modalService: ModalService,
    public user: UserService,
    private util: UtilService
  ) {
    this._api.loadCountries().subscribe((res: Country[]) => {
      this.countriesList = res
    })

    // Used to subscribe to country selection to filter addresses only for the country selected.
    this.activeSubs.push(this.addressForm.get('countryCode').valueChanges.subscribe(value => {
      if(value) {
        this.addressForm.get('address').addValidators(Validators.required)
        this.addressForm.get('postcode').addValidators(Validators.required)
        this.addressForm.get('city').addValidators(Validators.required)
        this.addressForm.get('address').enable()
        this.addressForm.get('addressExtra').enable()
        this.addressForm.get('postcode').enable()
        this.addressForm.get('city').enable()
      } else {
        this.addressForm.get('address').removeValidators(Validators.required)
        this.addressForm.get('postcode').removeValidators(Validators.required)
        this.addressForm.get('city').removeValidators(Validators.required)
        this.addressForm.get('address').disable()
        this.addressForm.get('addressExtra').disable()
        this.addressForm.get('postcode').disable()
        this.addressForm.get('city').disable()
      }
      this.addressForm.get('address').updateValueAndValidity({emitEvent: false})
      this.addressForm.get('postcode').updateValueAndValidity({emitEvent: false})
      this.addressForm.get('city').updateValueAndValidity({emitEvent: false})

      //clear the fields every time the address changes
      this.addressForm.patchValue({
        addressExtra: null,
        address: null,
        postcode: null,
        city: null,
        validated: null
      })
    }))

    // Define the existing validators for the phoneNumber field
    const phoneNumberValidators = [
      Validators.pattern("[0-9]{10}"),
    ];

    // Listen for changes to phone country code
    this.activeSubs.push(this.addressForm.get('phoneCountryCode').valueChanges.subscribe(value => {
      const phoneNumberControl = this.addressForm.get('phoneNumber');
      if(value) {
        phoneNumberControl.enable();
        phoneNumberControl.setValidators(Validators.compose([
          Validators.required, // add required validator
          ...phoneNumberValidators, // add existing validators
        ]));
        phoneNumberControl.updateValueAndValidity(); // update validation
      } else {
        phoneNumberControl.disable();
        phoneNumberControl.setValidators(phoneNumberValidators);
        phoneNumberControl.updateValueAndValidity(); // update validation
      }

      //clear the fields every time the address changes
      this.addressForm.patchValue({
        phoneNumber: null
      })

    }))

    // listen for address input change to suggest valid addresses
    this.activeSubs.push(this.addressForm.get('address').valueChanges.pipe(
        filter(value => typeof value == 'string'),
        mergeMap(value => {
          const params = {
            input: value,
            type: 'address',
            components: `country:${this.addressForm.get('countryCode').value}`
          }
          return this._api.googleAddressAutocomplete(params, this.data.guestJWT)
        })
      ).subscribe((autocompletePredictions: GooglePlaceAutocompletePrediction[]) => {
        //this.addressForm.patchValue({validated: false})
        this.filteredAddressObjects = autocompletePredictions
      })
    )

    // Listen for changes to the address fields in order to proceed with address validation.
    const addressFields = ['address', 'addressExtra', 'postcode', 'city']
    const addressValueChanges$ = merge(
      ...addressFields.map(field =>
        field === 'address'
          ? this.addressForm.get(field).valueChanges.pipe(
            // Stop validation when selecting an address from automatic prediction.
            filter(value => typeof value == 'string' || value === null)
          )
          : this.addressForm.get(field).valueChanges
      )
    )
    this.activeSubs.push(addressValueChanges$.pipe(
      // Set isAddressValidationNeeded to true to prevent submission before address validation is triggered.
      tap(() => {this.isAddressValidationNeeded = true}),
      debounceTime(1000),
      // Returns isAddressValidationNeeded to false when address validation is triggered.
      tap(() => {this.isAddressValidationNeeded = false}),
    ).subscribe(() => {
      this.validateAddress()
    }))

  }



  ngOnInit() {
    //check if address passed - to enable selection
    this.formMode =  !this.data.formOnly ? 'select' : !this.data.address? 'create': 'edit'

    // mask fields
    this.fieldsMasked = this.data.maskFields || []

    if (this.data.address && !this.data.disableEdit) {
      this.patchAddressForm(this.data.address)
    }
  }

  onDataRequest(evt) {

    const searchQuery = this.fliproomList.activeSearch
    if (searchQuery) {
      evt.params['search'] = searchQuery
    }
    evt.params['accountID'] = this.user.account.ID


    this._api.getAddressList(evt.pageIdx, 30, evt.sort, evt.params).subscribe((resp) => {
      this.dataRequested = resp;
    });
  }

  onAddressCreateSelected() {
    this.formMode = 'create'
    this.addressForm.reset()
  }

  onAddressSelectMode() {
    this.formMode = 'select'
  }

  patchAddressForm(address: Address) {
    this.formMode = 'edit'
    //patch address form
    // patch form withou trigger address change (which clears the form)
    address.countryCode = (address.countryCode || '').toUpperCase()
    this.addressForm.patchValue(address, {emitEvent: false})

    if (address.countryCode) {
      this.addressForm.get('address').enable({emitEvent: false})
      this.addressForm.get('addressExtra').enable({emitEvent: false})
      this.addressForm.get('postcode').enable({emitEvent: false})
      this.addressForm.get('city').enable({emitEvent: false})
    }

    if (address.phoneCountryCode) {
      this.addressForm.get('phoneNumber').enable()
    }
  }

  //Existing address selected
  onRowClick(address: Address) {
    if (this.data.disableEdit) {
      return this._modalCtrl.dismiss(address, 'submit')
    }
    this.patchAddressForm(address)
  }


  onCancel() {
    this._modalCtrl.dismiss();
  }

  onCountryChanged(iso: string) {
    const country  = this.countriesList.find(ct => ct.iso.toLowerCase() == iso.toLowerCase())
    this.addressForm.patchValue({country: country.country, countryCode: country.iso});
  }

  onAddressSelected(placeID: string) {
    this._api.googlePlace(placeID, this.data.guestJWT).subscribe((place: GooglePlace) => {
      const county = (place.address_components.find(ac => ac.types.includes('administrative_area_level_1')) || {long_name: null}).long_name
      const countyCode = (place.address_components.find(ac => ac.types.includes('administrative_area_level_1')) || {short_name: null}).short_name
      const city = (place.address_components.find(ac => ac.types.includes('postal_town')) || place.address_components.find(ac => ac.types.includes('locality')) || place.address_components.find(ac => ac.types.includes('administrative_area_level_3')) || {long_name: null}).long_name
      const postcode = (place.address_components.find(ac => ac.types.includes('postal_code')) || {long_name: null}).long_name
      const address = [place.address_components.find(ac => ac.types.includes('street_number')), place.address_components.find(ac => ac.types.includes('route'))].filter(r => r != null).map(r => r.long_name)

      this.addressForm.patchValue({
        address: address.join(" "),
        postcode: postcode,
        city: city,
        county: county,
        countyCode: countyCode,
      }, {emitEvent: true})


      return address.join(" ")
    })
  }

  validateAddress() {
    this.isValidating = true
    const rawAddress = {
      address: this.addressForm.value.address,
      addressExtra: this.addressForm.value.addressExtra,
      postcode: this.addressForm.value.postcode,
      city: this.addressForm.value.city,
      countryCode: this.addressForm.value.countryCode,
    }
    this._api.validateAddress(rawAddress, this.data.guestJWT).subscribe((result) => {
      this.addressForm.patchValue({
        validated: result.validated
      }, {emitEvent: false})
      this.isValidating = false
    }, (error) => {this.isValidating = false})
  }

  onSubmit() {
    this.util.markFormGroupTouched(this.addressForm);
    //this.util.markFormGroupDirty(this.addressForm);

    if (this.addressForm.invalid) {
      Object.keys(this.addressForm.controls).forEach(field => {
        if (this.addressForm.get(field).invalid) {
          console.log('Invalid field:', field);
        }
      });
    }
    // Adjustments when maskFields is present
    if(this.fieldsMasked.includes('name')){
      this.addressForm.get('name').clearValidators();
      this.addressForm.get('name').updateValueAndValidity();
    }

    if (!this.addressForm.valid) {
      return
    }

    // If raw: true, Doesn't make an API request to update the address.
    if (this.data.bypassBackendRequest) {
      return this._modalCtrl.dismiss(this.addressForm.value, 'submit')
    }

    this.isLoading = true

    if (this.formMode == "create") {
      const body = this.addressForm.value
      body['accountID'] = this.user.account.ID
      this._api.createAddress(body).subscribe((address: Address) => {
        this._modalCtrl.dismiss(address, 'submit')
      })
    }
    // edit
    else {
      this._api.updateAddress(this.addressForm.value.ID, this.addressForm.value).subscribe((address: Address) => {
        this._modalCtrl.dismiss(address, 'submit')
      })
    }

  }

  ngOnDestroy() {
    this.activeSubs.forEach(subscription => subscription.unsubscribe());
  }

}
