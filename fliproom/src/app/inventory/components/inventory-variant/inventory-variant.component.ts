import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Product, ProductVariant} from "../../../shared/models/Product.model";
import {InventoryRecord} from "../../../shared/models/InventoryRecord";
import {UserService} from "../../../core/user.service";
import { environment } from 'src/environments/environment';
import {Router} from "@angular/router";
import {ModalService} from "../../../shared/modal/modal.service";
import {filter} from "rxjs/operators";

@Component({
  selector: 'app-inventory-variant',
  templateUrl: './inventory-variant.component.html',
  styleUrls: ['./inventory-variant.component.scss'],
})
export class InventoryVariantComponent implements OnInit {
  @Input() product: Product
  @Input() inventory: InventoryRecord[]
  @Input() filteredInventory: InventoryRecord[]
  @Input() selectedVariant: ProductVariant
  @Input() inventoryType: string
  @Output() inventoryTypeChange = new EventEmitter<object>();
  @Output() inventorySelected = new EventEmitter<object>();
  @Output() onCreateInventoryRecordBtnClick = new EventEmitter<null>();

  public environment = environment
  public tabs = ['stock']

  constructor(
    public user: UserService,
    private _router: Router,
    private _modalCtrl: ModalService

  ) { }

  ngOnInit() {
    if(this.user.iam.inventory.virtual && !this.user.account.isConsignor){
      this.tabs.push('virtual')
    }

    if (this.user.iam.service.consignment) {
      this.tabs.push('consignment')
    }
  }

  onSegmentChanged(evt){
    this.inventoryType = evt.detail.value
    this.inventoryTypeChange.emit({value: this.inventoryType})
  }

  onInventoryRecordClick(inventoryRecord: InventoryRecord) {
    if(this.user.iam.inventory.update){
      this.inventorySelected.emit({inventoryRecord: inventoryRecord})
    }
    else {
      this._modalCtrl.info('You have not been granted the permission to edit inventory')
    }

  }

  onSyncProblemClick() {
    this._modalCtrl.confirm('Would you like assign a product from the market oracle?').pipe(filter(res => res)).subscribe(res => {
      this._router.navigate(['/products/form'], {queryParams: {
        formType: 'update',
        productID: this.product.ID
      }})
    }
  )
  }

  onCreateInventoryRecord() {
    this.onCreateInventoryRecordBtnClick.emit()
  }

  get payoutRangeMessage() {
    const inventoryRecordsPayouts = this.inventory.filter(inv => (inv.productVariantID == this.selectedVariant.ID)).map(invRec => invRec.payoutsRange)
    let minPayout = inventoryRecordsPayouts.length == 0 ? 0 :Math.min(...inventoryRecordsPayouts.map(payoutRange => payoutRange.min))
    let maxPayout = inventoryRecordsPayouts.length == 0 ? 0 :Math.max(...inventoryRecordsPayouts.map(payoutRange => payoutRange.max))
    minPayout.toFixed(2)
    maxPayout.toFixed(2)
    if(minPayout == maxPayout){
      return `${this.user.account.currencySymbol}  ${minPayout}`
    }
    else {
      return `${this.user.account.currencySymbol} ${minPayout} - ${maxPayout}`
    }
  }

  get totalQuantity() {
    return this.inventory.filter(inv => (inv.productVariantID == this.selectedVariant.ID && !inv.virtual)).reduce((tot, inv) => tot += inv.quantity, 0)
  }

  getActiveListingsRatio(inventoryRecord: InventoryRecord) {
    return (inventoryRecord.activeListings.length / inventoryRecord.listings.length + 1) * 100
  }

  get trackCost() {
    let untracked = localStorage.getItem('untrack-cost');
    if ( untracked == 'true') {
      return false;
    }
    return true;
  }


}
