import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { UtilService } from 'src/app/core/util.service';
import { Warehouse } from 'src/app/shared/models/Warehouse.model';

@Component({
  selector: 'app-transfer-header',
  templateUrl: './transfer-header.component.html',
  styleUrls: ['./transfer-header.component.scss'],
})
export class TransferHeaderComponent implements OnInit {
  /**
   * 
   * 
   * 
   */
  @Input() transferHeaderForm: any;
  @Output() transferHeaderFormChange = new EventEmitter<any>()
  @Output() onNext = new EventEmitter();

  public originAvailableWarehouses: Warehouse[] = this.user.account.warehouses;
  private _externalAvailableWarehouses: Warehouse[] = [] // Store list of warehouses accessible due to consignment
  public destinationAvailableWarehouses: Warehouse[] = [] // internal warehosue (- origin) + consignment warehouses 
  private _subs: Subscription[] = []
  constructor(
    private _utils: UtilService,
    public user: UserService,
    private _api: ApiService
  ) { }

  ngOnInit() {
    this._subs.push(this.transferHeaderForm.get('origin').valueChanges.subscribe(warehouse => this.onOriginChange(warehouse)))

    // fetch all fulfillment centre warehouses of accounts the user is consigning for
    const uniqueAccountIDs = [... new Set(this.user.account.saleChannels.filter(sc => sc.accountID != this.user.account.ID).map(sc => sc.accountID))]
    this._api.getWarehousesList(0, 999, 'name:asc', {fulfillmentCentre: 1, accountID: uniqueAccountIDs}).subscribe((resp) => {
      this._externalAvailableWarehouses = resp.data as Warehouse[]
      
      // pre patch for accounts with 1 warehouse
      if(this.originAvailableWarehouses.length == 1){
        this.transferHeaderForm.patchValue({
          origin: this.originAvailableWarehouses[0],
        })
      } else if (this.transferHeaderForm.value.origin?.ID) { // on return to the form that was previously filled
        this.onOriginChange(this.transferHeaderForm.value.origin)
      }
    })
  }

  onOriginChange(warehouse: Warehouse) {
    // Sometimes onOriginChange subscription is called before leave causing error
    if(!warehouse) {return} 
      
    /**
     * Compute what warehouses are avaialble in the destination field: 
     * - show all internal warehouses
     * - show external warehouses (fulfillment centre only) of accounts consigning at
     * 
    */
    this.destinationAvailableWarehouses = this.user.account.warehouses.filter(wh => wh.ID != warehouse.ID)
    this.destinationAvailableWarehouses = this.destinationAvailableWarehouses.concat(this._externalAvailableWarehouses)

    // can pre-fill ? only 1 destination or form already filled
    let destinationMatch;
    if (this.destinationAvailableWarehouses.length == 1) { //only 1 destination available
      destinationMatch = this.destinationAvailableWarehouses[0]
    } else if (this.transferHeaderForm.value.destination?.ID) { // on return to the form that was previously filled
      destinationMatch = this.destinationAvailableWarehouses.find(wh => wh.ID == this.transferHeaderForm.value.destination?.ID)
    } else {
      this.transferHeaderForm.get('destination').reset()
    }

    this.transferHeaderForm.patchValue({
      destination: destinationMatch,
    })
  }

  onNextButtonClicked() {
    this._utils.markFormGroupDirty(this.transferHeaderForm)
    this._subs.map(sub => sub.unsubscribe())

    if (this.transferHeaderForm.valid) {
      this.onNext.emit()
    }
  }

  // used for mat-select patching when objects are used instead of standard values
  compareObjectsByIDFn(o1: Object, o2: Object): boolean {
    return (o1 && o2 && o1['ID'] == o2['ID'])
  }

  ionViewWillLeave() {
    this._subs.map((sub: Subscription) => {
      sub.unsubscribe()
    })
  }

}
