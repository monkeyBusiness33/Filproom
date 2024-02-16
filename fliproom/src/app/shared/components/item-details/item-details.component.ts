import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from 'src/app/core/api.service';
import { ScannerResponse } from 'src/app/core/barcode-scanner.service';
import { PluginsService } from 'src/app/core/plugins.service';
import { UserService } from 'src/app/core/user.service';
import { ModalService, IActionsSheetAction } from '../../modal/modal.service';
import { InventoryListing } from '../../models/InventoryRecord';
import { Item } from '../../models/Item.model';
import { SaleChannel } from '../../models/SaleChannel';
import { Warehouse } from '../../models/Warehouse.model';
import { OrdersListComponent } from '../../../orders/modals/orders-list/orders-list.component';
import { filter, map, mergeMap } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-item-details',
  templateUrl: './item-details.component.html',
  styleUrls: ['./item-details.component.scss'],
})
export class ItemDetailsComponent implements OnInit {
  /**
   * This components is used to display the details for a selected item
   */
  public isLoading: boolean = false
  public item: Item;
  public accessibleInventoryListings: InventoryListing[] = [] // extract the inventory listings accessible by the user. If consigned stock - the default listing of the consignor should not be visible here
  private activeSubs: Subscription[] = []

  constructor(
    private _api: ApiService,
    private _modalCtrl: ModalService,
    public user: UserService,
    private _route: ActivatedRoute,
    private _router: Router,
    private _plugins: PluginsService
  ) { }

  ngOnInit() {
    this.onRefresh()
  }

  onRefresh() {
    this.isLoading = true
    this._api.getItemByID(parseInt(this._route.snapshot.paramMap.get('ID'))).subscribe((item: Item) => {
      this.isLoading = false
      this.item = item

      this.accessibleInventoryListings = this.item.inventory?.listings?.filter((invListing: InventoryListing) => this.user.account.saleChannels.find(sc => sc.ID == invListing.saleChannelID))
      //TODO: REMOVE HARRODS HARDCODE PATCH
      //remove this once the user config interface is in place
      //<<<<<
      if (this.user.email == 'kurtgeiger2022@gmail.com' && this.accessibleInventoryListings){
        this.accessibleInventoryListings = this.accessibleInventoryListings.filter((invListing: InventoryListing)  => invListing.saleChannelID == 2015)
      }
      //>>>>>
    })
  }

  get saleOrder() {
    return this.item.orders.find(o => (o.type.name == 'outbound' && o.accountID == this.user.account.ID))
  }

  ionViewWillEnter() {
    // subscribe to barcode scan (used for barcode update)
    const sub1 = this._plugins.scanner.scannerReadListener.subscribe((scannerResponse: ScannerResponse) => {
      const barcode = scannerResponse.data.toLowerCase().trim()

      this.isLoading = true
      // check if barcode already in use
      this._api.getItemsList(0, 10, null, {barcode: barcode}).pipe(
        filter(response => {
          if (response.count != 0) {
            this._modalCtrl.warning(`Barcode ${barcode} is already assigned to another item`)
            this.isLoading = false
          }
          return response.count == 0
        }),
        mergeMap(() => this._api.updateItem(this.item.ID, {barcode: barcode}))
      ).subscribe((res) => {
        this._modalCtrl.success('Barcode Updated')
        this.onRefresh()
      })
    })
    this.activeSubs.push(sub1)
  }

  ionViewWillLeave() {
    this.activeSubs.map(sub => sub.unsubscribe())
  }

  getSaleChannel(saleChannelID: number): SaleChannel {
    return this.user.account.saleChannels.find(sc => sc.ID == saleChannelID)
  }

  onOpenActionSheet() {
    const actions: IActionsSheetAction[] = [
      {title: 'View Orders', key: 'orders'},
      {title: 'Similar Items', key: 'similar-item'}
    ]

    // Barcode
    if (this.user.iam.service.warehousing) {
      let disabled = false, description = '';
      if (!this.item.warehouse.ID) {
        disabled = true;
        description = 'You can\'t update this barcode because the item is in transit';
      } else if (this.user.account.ID !== this.item.warehouse.accountID) {
        disabled = true;
        description = 'You can\'t update this barcode because it is at an external location'
      }
      actions.unshift({ title: 'Update Barcode', key: 'update-barcode', disabled, description })
      if (this.item.barcode) {
        actions.push({title: 'Remove Barcode', key: 'remove-barcode', disabled, description})
      }
    }


    // if item in stock - allow to inventory notes
    if (this.item.inventoryID) {
      actions.push({title: 'Update Notes', key: 'update-notes'})
    }

    // if item not deleted yet and not sold
    if (!this.item.deletedAt && this.item.inventoryID) {
      actions.push({title: 'Delete Item', key: 'delete'})
    }

    if (!this.item.inventoryID) {
      actions.push({title: 'Sale Order', key: 'sale-order'})
    }

    this._modalCtrl.actionSheet('Actions', actions).pipe(
      filter(res => res.role == "submit"),
      map(res => res.data)
    ).subscribe((action: string) => {
      switch (action) {
        case 'update-barcode':
          this._plugins.scanner.setReadMode();
          break;
        case 'remove-barcode':
          this._modalCtrl.confirm(`Remove Barcode ${this.item.barcode} from this item?`).pipe(
            filter(res => res)
          ).subscribe(resp => {
            this._api.updateItem(this.item.ID, {barcode: null}).subscribe(() => {
              this._modalCtrl.success(`Item Updated`)
              this.onRefresh()
            })
          })
          break;
        case 'delete':
          this._modalCtrl.confirm(`Delete Item with Barcode ${this.item.barcode} from the system? This action can't be undone`).pipe(
            filter(res => res)
          ).subscribe(resp => {
            this._api.deleteInventoryItems(this.item.inventoryID, {itemID: this.item.ID}).subscribe(() => {
              this._modalCtrl.success(`Item Removed`)
              this.onRefresh()
            })
          })
          break;
        case 'update-notes':
          this._modalCtrl.input({title: this.item.inventory.notes ? 'Update Notes' : 'Add Notes', type: 'string', input: this.item.inventory.notes}).pipe(
            mergeMap((text: string) => this._api.updateInventory(this.item.inventoryID, {notes: text}))
          ).subscribe((test: string) => {
            this._modalCtrl.success(`Notes Updated`)
            this.onRefresh()
          })
          break;
        case 'similar-item':
          let warehouses = this.user.account.warehouses.map((warehouse) => warehouse.ID).join(',');
          // search similar variant
          this._router.navigate([`/warehousing/item-search`], {queryParams: {'variant.name': `~${this.item.variant.name}`,'warehouseID':warehouses}})
          break;
        case 'sale-order':
          this._router.navigate([`/orders/${this.saleOrder.ID}`])
          break;
        case 'orders':
          console.log("Open modal", this.item.ID);
          this.onOpenOrdersList(this.item.ID)
          break;
      }
    })
  }

  onOpenOrdersList(itemID: number) {
    this._api.getItemByID(itemID).subscribe((item: Item) => {
      // display only orders accessible by the account
      const availableOrders = item.orders.filter(
        (order) => order.account.ID == this.user.account.ID
      );
      this._modalCtrl.open(OrdersListComponent, availableOrders);
    });
  }

}
