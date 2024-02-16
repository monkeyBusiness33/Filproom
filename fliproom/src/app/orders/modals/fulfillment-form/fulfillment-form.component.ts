import { SelectionModel } from '@angular/cdk/collections';
import { Component, Inject, Input, OnInit } from '@angular/core';
import { FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { ModalController } from '@ionic/angular';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { Courier, Fulfillment } from 'src/app/shared/models/Fulfillment.model';
import { Order } from 'src/app/shared/models/Order.model';
import { Warehouse } from 'src/app/shared/models/Warehouse.model';
import { environment } from 'src/environments/environment';
import {ModalService} from "../../../shared/modal/modal.service";
import {Address} from "../../../shared/models/Address.model";
import {AddressContactPage} from "../address-contact/address-contact.page";
import {filter, mergeMap} from "rxjs/operators";
import { forkJoin } from 'rxjs';

export interface IFulfillmentForm {
  order: Order
  fulfillment?: Fulfillment | null
}

@Component({
  selector: 'app-fulfillment-form',
  templateUrl: './fulfillment-form.component.html',
  styleUrls: ['./fulfillment-form.component.scss'],
})
export class FulfillmentFormComponent implements OnInit {
  /**
   *
   * shipFrom warehouses:
   *
   *
   *
   */
  @Input() data: {
    orderID: number,
    fulfillment: Fulfillment | null
  }
  public mode: string = 'create'; // create,edit
  public order: Order;
  public fulfillment: Fulfillment;
  public environment = environment

  public shipFromAddresses: Address[] = []
  public shipToAddresses:   Address[] = []
  public availableCouriers: Courier[] = []

  public fulfillmentForm = new FormGroup({
    shipFromAddress: new FormControl(null),
    shipToAddress: new FormControl(null, Validators.required),
    courier: new FormControl(null, Validators.required),
    courierServiceCode: new FormControl(null),
    reference1: new FormControl(null),
    trackingNumber: new FormControl(null),
    skip: new FormControl(null),
    orderLineItems: new FormArray([]),
  });

  public dataSource: MatTableDataSource<any> = new MatTableDataSource();
  public displayedColumns: string[] = [
    'select',
    'image',
    'item.account.name',
    'status.name',
    'product.title',
    'product.code',
    'variant.name',
    'cost',
    'price',
  ];

  public isLoading: boolean = false;
  public buttonLoading: boolean = false;


  constructor(
    private _api: ApiService,
    private user: UserService,
    private _modalCtrl: ModalController,
    private _modal: ModalService
  ) {}

  ngOnInit(): void {
    // don't allow to control for fulfillment.dispatch if they don;t have the barcoding system enabled
    if (!this.user.iam.service.warehousing) {
      this.fulfillmentForm.get('skip').disable();
    }

    this.mode = this.data.fulfillment ? 'edit' : 'create';
    this.fulfillment = this.data.fulfillment;

    this.isLoading = true
    forkJoin({
      couriers: this._api.getAvailableCouriers(this.data.orderID),
      accountFulfillmentAddresses: this._api.getAddressList(0, 99, 'name:desc', {ID: this.user.account.warehouses.map(wh => wh.addressID)}),
      order: this._api.getOrderByID(this.data.orderID)
    }).subscribe((response) => {
      this.availableCouriers = response.couriers as Courier[]
      const accountFulfillmentAddresses = response.accountFulfillmentAddresses['data'] as Address[]
      this.order = response.order as Order
      this.isLoading = false

      /**
       * outbound (edit consignor)
       * inbound (edit consignor)
       * trasnfer-out
       * internal transfer
       */

      /**
       * Keep here for reference, remove later on
       * can't generate fulfillment if
       * 1. account owner of transfer in but not transfer out (external transfer)
       * 2. account owenr of inbound order that has a siblignID (consignment sale)
       */


      // purchase order: inbound but wihthout siblingID
      if (this.order.type.name == 'inbound' && this.order.siblingOrderID == null) {
        this.shipFromAddresses = this.order.consignor.ID ? [this.order.consignor] : []
        this.shipToAddresses = accountFulfillmentAddresses
      // if external transfer and transfer-in order - can't fulfill
      } else if (this.order.type.name == "transfer-in" && this.order.consignor.accountID != this.order.consignee.accountID) {
        this.shipFromAddresses = [this.order.consignor]
      } else { //internal transfers, sale order
        this.shipFromAddresses = accountFulfillmentAddresses
        this.shipToAddresses = [this.order.consignee]
      }

      // Display only orderLineItems not yet assigned to fulfillment
      this.orderLineItems['controls'] = [];
      this.order.orderLineItems
        .filter((oli) => oli.fulfillmentID == null)
        .map((oli) =>
          this.orderLineItems.push(
            new FormGroup({
              ID: new FormControl(oli.ID),
              selected: new FormControl(false),
              disabled: new FormControl(true),
              disabledMessage: new FormControl(''),
              product: new FormControl(oli.product),
              variant: new FormControl(oli.variant),
              status: new FormControl(oli.status),
              item: new FormControl(oli.item),
            })
          )
        );
      this.dataSource.data = this.orderLineItems['controls'];

      // pre-fill fulfillment reference using orderID and reference
      this.fulfillmentForm.patchValue({
        reference1: `order #${this.order.ID} - ${this.order.reference1 || ''}`,
      })

      if (this.mode == 'edit') { // on edit patch values
        // don;t allow to edit fulfillment items - not supported yet
        this.fulfillmentForm.get('skip').disable();

        this.shipFromAddresses = this.order.consignor?.ID ? [this.order.consignor] : []
        this.shipToAddresses = this.order.consignee?.ID ? [this.order.consignee] : []

        this.fulfillmentForm.patchValue({
          courier: this.fulfillment.courier?.code || 'manual',
          reference1: this.fulfillment.reference1,
          trackingNumber: this.fulfillment.trackingNumber,
        });

        // don't allow to update consignor address if user is not the owner of the address
        if (!this.fulfillment.origin.canEdit(this.user)) {
          this.fulfillmentForm.get('shipFromAddress').disable();
        }

        // don't allow to update consignee address if user is not the owner of the address
        if (!this.fulfillment.destination.canEdit(this.user)) {
          this.fulfillmentForm.get('shipToAddress').disable();
        }

        // can update only fulfillment reference if is using a courier already
        if (this.fulfillmentFormData.courier != 'manual') {
          this.fulfillmentForm.get('shipFromAddress').disable();
          this.fulfillmentForm.get('shipToAddress').disable();
          this.fulfillmentForm.get('courier').disable();
          this.fulfillmentForm.get('courierServiceCode').disable();
          this.fulfillmentForm.get('trackingNumber').disable();
        }
      }

      // patch fulfillment if only one option
      if (this.shipFromAddresses.length == 1) {
        this.fulfillmentForm.patchValue({
          shipFromAddress: this.shipFromAddresses[0],
        });
      }

      if (this.shipToAddresses.length == 1) {
        this.fulfillmentForm.patchValue({
          shipToAddress: this.shipToAddresses[0],
        });
      }

      // update order line item state based on addresses selected
      this.updateOrderLineItemsState();

      this.isLoading = false
    })

  }

  onChangeShipFrom() {
    this.fulfillmentForm.patchValue({
      shipFromAddress: null
    })

    this.updateOrderLineItemsState()
  }

  onChangeShipTo() {
    this.fulfillmentForm.patchValue({
      shipToAddress: null
    })

    this.updateOrderLineItemsState()
  }

  onCancel() {
    this._modalCtrl.dismiss();
  }

  onAddressSelected(addressControlForm: FormControl) {
    if (addressControlForm.disabled) {
      return
    }
    this._modal.open(AddressContactPage, { address: addressControlForm.value, formOnly: true}).pipe(
      filter(res => res)
    )
    .subscribe((res) => this.ngOnInit());
  }

  onCreateSubmit() {
    this.fulfillmentForm.markAllAsTouched();

    if (this.fulfillmentForm.valid) {
      this.buttonLoading = true;

      const body = {
        accountID: this.user.account.ID,
        originAddressID: this.fulfillmentFormData.shipFromAddress?.ID,
        destinationAddressID: this.fulfillmentFormData.shipToAddress?.ID,
        courier: this.fulfillmentFormData.courier == 'manual' ? null : this.fulfillmentFormData.courier,
        courierServiceCode: this.fulfillmentFormData.courierServiceCode,
        reference1: this.fulfillmentFormData.reference1,
        trackingNumber: this.fulfillmentFormData.trackingNumber,
        orderLineItems: this.orderLineItems['controls'] // add orderLineItems selected to fulfill
                        .filter((oliForm) => oliForm.value.selected)
                        .map((orderLineItem) => {return { ID: orderLineItem.value.ID }})
      };

      // Convert skip to correct process depending on order type
      if ((this.order.type.name == 'outbound' || this.order.type.name == 'transfer-out') && this.fulfillmentFormData.skip) {
        body['setAsDispatched'] = true;
      }

      if (this.order.type.name == 'inbound' && this.fulfillmentFormData.skip) {
        body['setAsDelivered'] = true;
      }


      this._api
        .createFulfillment(this.order.ID, body)
        .subscribe((fulfillment: Fulfillment) => {
          this._modalCtrl.dismiss(fulfillment, 'submit');
        });
    }
  }

  onEditSubmit() {
    this.fulfillmentForm.markAllAsTouched();
    if (this.fulfillmentForm.valid) {
      this.buttonLoading = true;

      const updates = {
        originAddressID: this.fulfillmentFormData.shipFromAddress?.ID,
        destinationAddressID: this.fulfillmentFormData.shipToAddress?.ID,
        courier: this.fulfillmentFormData.courier == 'manual' ? null : this.fulfillmentFormData.courier,
        courierServiceCode: this.fulfillmentFormData.courierServiceCode,
        reference1: this.fulfillmentFormData.reference1,
        trackingNumber: this.fulfillmentFormData.trackingNumber,
      };

      this._api
        .updateFulfillment(this.order.ID, this.fulfillment.ID, updates)
        .subscribe((fulfillment: Fulfillment) => {
          this._modalCtrl.dismiss(fulfillment, 'submit');
        });
    }
  }

  updateOrderLineItemsState() {
    this.orderLineItems['controls'].map((oliForm) => {
      const orderLineItem = this.order.orderLineItems.find((i) => i.ID == oliForm.value.ID);
      const orderLineItemState = {
        status: 'enabled',
        message: '',
      };

      // check that item is at shipFrom address
      if (orderLineItem.item.warehouseID != this.fulfillmentFormData.shipFromAddress?.warehouse?.ID) {
        orderLineItemState['message'] = 'This item is not at the ship from address selected'
      }

      // if outbound order (sale or transfer-out) order line item must have status 'fulfill'
      if ((this.order.type.name == 'outbound' || this.order.type.name == 'transfer-out')
        &&
        (orderLineItem.status.name != 'fulfill')
      ) {
        orderLineItemState['message'] = `This item should have status 'fulfill' to be fulfilled`
      }

      // if inbound order (purchase order) order line item must have status 'fulfill'
      if (this.order.type.name == 'inbound' && orderLineItem.status.name != 'fulfill') {
        orderLineItemState['message'] = `This item should have status 'fulfill' to be fulfilled`
      }

      if (orderLineItemState['message'] != '') {
        orderLineItemState['status'] = 'disabled'
      }

      oliForm.patchValue({
        selected: false,
        disabled: orderLineItemState['status'] == 'disabled',
        disabledMessage: orderLineItemState['message'],
      });
    })
  }

  /**
   * This function validates if the account is able to use any courier for fulfillment
   *
   * -Ship From Address must be selected
   * -Ship To Address must be selected
   * -Ship From Address must be validated
   * -Ship To Address must be validated
   * -Check general courier availability
   */
  canUseCouriers() {
    const response = {
      status: 'enabled',
      message: '',
    };

    if (!this.fulfillmentFormData.shipFromAddress) {
      response.message += 'Missing Ship From Address\n';
    } else if (this.fulfillmentFormData.shipFromAddress && !this.fulfillmentFormData.shipFromAddress.validated) {
      response.message += 'Validate Ship From Address\n';
    }

    if (!this.fulfillmentFormData.shipToAddress) {
      response.message += 'Missing Ship To Address\n';
    } else if (this.fulfillmentFormData.shipToAddress && !this.fulfillmentFormData.shipToAddress.validated) {
      response.message += 'Validate Ship To Address\n';
    }

    if (this.fulfillmentFormData.shipFromAddress && this.fulfillmentFormData.shipToAddress && this.fulfillmentFormData.shipFromAddress.countryCode != this.fulfillmentFormData.shipToAddress.countryCode) {
      response.message += 'International Shipments not support yet. Coming soon!\n';
    }

    if (this.availableCouriers.length == 0) {
      response.message += 'No Couriers Available. Contact support to connect one\n';
    }

    if (response['message'] != '') {
      response['status'] = 'disabled'
    }

    return response
  }

  /*This function checks if the courier selected can be used for the fulfillment
  - Courier must have a billing address
  - Courier billing address must be validated
  - Courier must have a billing account
   */

  canUseCourierService(courier: Courier) {
    //general couriers validation
    const response = this.canUseCouriers()
    if (response.status == 'disabled') {
      return response
    }
    //Courier specific validation

    //check if courier billung address is validated
    if (courier.account && courier.account.billingAddress && !courier.account.billingAddress.validated) {
      this.user.account.ID == courier.accountID ? response.message += "Please validate your billing address from the settings\n" : response.message += "Courier billing address is not validated, contact courier account holder\n"
    }

    //check if courier has a billing address
    if (courier.account && !courier.account.billingAddress) {
      this.user.account.ID == courier.accountID ? response.message += "Please set up your billing address from the settings\n" : response.message += "Courier doesn't have a billing address, contact courier account holder\n"
    }

    //check for courier billing account
    if (!courier.courierBillingAccount ) {
      this.user.account.ID == courier.accountID ? response.message += "Please contact support to set up your courier billing account\n" : response.message += "Courier account holder is missing part of the courier set up, contact account\n"
    }

    if (response['message'] != '') {
      response['status'] = 'disabled'
    }

    return response

  }

  isFulfillmentFormValid() {
    const selectedOLI = this.orderLineItems['controls'].filter(
      (oliForm) => oliForm.value.selected
    );
    return selectedOLI.length > 0 && this.fulfillmentForm.valid;
  }


  isSelectAllDisabled(): boolean {
    return (
      this.orderLineItems['controls'].filter(
        (oliForm) => !oliForm.value.disabled
      ).length == 0
    );
  }

  isAllChecked(): boolean {
    // all the olis available have been selected & there is at least 1 oli available
    return (
      this.orderLineItems['controls'].filter(
        (oliForm) => !oliForm.value.disabled && !oliForm.value.selected
      ).length == 0 &&
      this.orderLineItems['controls'].filter(
        (oliForm) => !oliForm.value.disabled
      ).length > 0
    );
  }

  onMasterToggle() {
    //User toggles select all but no items available to fulfill
    if (this.olisAvailableForFulfillment == 0){
      this._modal.warning('No Items Available For Fulfillment')
      return
    }
    const isSelected = this.olisAvailableForFulfillment > 0 && this.olisSelectedForFulfillment != this.olisAvailableForFulfillment
    this.orderLineItems['controls']
      .filter((oliForm) => !oliForm.value.disabled)
      .map((oliForm) => oliForm.patchValue({ selected: isSelected }));
  }

  onCourierChange(courier: Courier | null) {
    // upon courier selected - set service code. At the moment hardcoded to the first available
    const updates = {
      courierServiceCode: courier ? courier.getNationalServices()[0] : null,
    }

    // don't automatically skip if
    if (!this.user.iam.service.warehousing && courier === null) {
      updates['skip'] = true
    }

    this.fulfillmentForm.patchValue(updates)
  }

  //GETTERS
  get fulfillmentFormData() {
    return this.fulfillmentForm.getRawValue()
  }

  get orderLineItems() {
    return this.fulfillmentForm.get('orderLineItems') as FormArray;
  }

  get olisAvailableForFulfillment(){
    // returns the number of order line items not disabled and so available to be fulfilled
    return this.orderLineItems['controls'].filter((oliForm) => !oliForm.value.disabled).length
  }

  get olisSelectedForFulfillment(){
    // returns the number of order line items selected
    return this.orderLineItems['controls'].filter((oliForm) => oliForm.value.selected).length
  }

  get shipToAddress() {
    return this.fulfillmentForm.get('shipToAddress') as FormControl;
  }

  get shipFromAddress() {
    return this.fulfillmentForm.get('shipFromAddress') as FormControl;
  }
}
