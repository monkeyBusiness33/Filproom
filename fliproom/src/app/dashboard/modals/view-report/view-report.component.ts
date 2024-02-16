import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { forkJoin, of } from 'rxjs';
import { filter, map, mergeMap, switchMap } from 'rxjs/operators';
import { AnalyticsService } from 'src/app/core/analytics.service';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from "src/app/core/user.service";
import { IModalResponse, ModalService } from 'src/app/shared/modal/modal.service';
import { InventoryListing, InventoryRecord } from 'src/app/shared/models/InventoryRecord';
import { Product, ProductMatchLookup, ProductVariant } from 'src/app/shared/models/Product.model';
import { ReportMetadata } from 'src/app/shared/models/ReportMetadata';
import { ProductMatchComponent } from 'src/app/shared/product-match/product-match.component';
import { InventoryRecordComponent } from "src/app/inventory/components/inventory-record/inventory-record.component";
import { environment } from 'src/environments/environment';
import {EventActionEnum} from "../../../shared/enums/event-action.enum";


export interface IReport {
  data: Object[],
  metadata: ReportMetadata
}

@Component({
  selector: 'app-view-report',
  templateUrl: './view-report.component.html',
  styleUrls: ['./view-report.component.scss'],
})
export class ViewReportComponent implements OnInit {
  @Input() data: IReport;

  public reportName: string; // displays the name of the report opened
  public reportDataList: any[] = [] // contains the processed data to be displayed in the report modal

  constructor(
    private _modalCtrl: ModalController,
    private _api: ApiService,
    private _modalService: ModalService,
    public _router: Router,
    private _analytics: AnalyticsService,
    public user: UserService,
  ) { }

  ngOnInit() {
    switch (this.data.metadata.type) {
      case 'disconnected-listings':
        this.reportName = 'Disconnected Listings'
        this.onInitDisconnectedListings()
        break;
      case 'stock-levels':
        this.reportName = 'Restock Suggestions'
        this.onInitStockLevels()
        break;
      case 'best-selling-products':
        this.reportName = 'Best Consignment Products'
        this.onInitBestSellingProducts()
        break;
      case 'new-product-uploads':
        this.reportName = 'New Consignment Products'
        this.onInitNewUploadProducts()
        break;
      default:
        break;
    }
    this._analytics.trackEvent('report-open', {reportType: this.data.metadata.type, reportId: this.data.metadata.ID})
  }

  onCancel() {
    this._modalCtrl.dismiss()
  }

  onInitDisconnectedListings() {
    /**
     * This function is called when the report type is 'disconnected-listings'.
     * It will fetch the inventory listing data for each inventory listing ID in the report data.
     */
    forkJoin(this.data.data.map(record => this._api.getInventoryListingByID(record['inventoryListingID'])))
    .subscribe((invListing: InventoryListing[]) => {
      this.reportDataList = invListing
    })
  }

  onInitStockLevels() {
    forkJoin(this.data.data.map(record => this._api.getVariantByID(record['productVariantID']).pipe(
      switchMap((productVariant: ProductVariant) => {
        return of({
          ...record,
          variant: productVariant,
        });
      })
    )))
    .subscribe((reportDataList: any[]) => {
      this.reportDataList = reportDataList
    })
  }

  onInitBestSellingProducts() {
    forkJoin(this.data.data.map((record) => this._api.getProduct(record['productID']).pipe(
      switchMap((product: Product) =>
        this._api.getVariantByID(record['mostSoldVariantID']).pipe(
          switchMap((mostSoldVariant: ProductVariant) => {
            return of({
              ...record,
              product,
              mostSoldVariant,
            });
          })
        )
      )
    )))
    .subscribe((reportDataList: any[]) => {
      this.reportDataList = reportDataList
    });
  }

  onInitNewUploadProducts() {
    forkJoin(this.data.data.map((record) => this._api.getProduct(record['productID']).pipe(
      switchMap((product: Product) =>
        of({
          ...record,
          product
        })
      )
    )))
    .subscribe((reportDataList: any[]) => {
      this.reportDataList = reportDataList
    });
  }

  createEvent(resource: string, action: EventActionEnum) {
    const body = { resource, action };
    this._api.createEvent(body).subscribe((resp) => {});
  }

  onReportDataRecordClick(reportType: string, record: Object) {
    /**
     * This function is called when a record in the report data list is clicked.
     */

    const actions = []
    switch (reportType) {
      case 'disconnected-listings':
        // don;t allow delete action if the invenotyr listing has already status deleted
        if ((record as InventoryListing).status != 'deleted') {
          actions.push({icon: 'info', title: 'Delete', description: '', disabled: false, key: 'delete-disconnected-listing'})
        }
        actions.push({icon: 'info', title: 'Reconnect', description: '', disabled: false, key: 'reconnect-disconnected-listing'})
        break;
      case 'best-selling-products':
      case 'new-product-uploads':
        actions.push({icon: 'info', title: 'View Product', description: '', disabled: false, key: 'view-product'})
        break;
      case 'stock-levels':
        actions.push({icon: 'info', title: 'Add Inventory', description: '', disabled: false, key: 'view-stock-levels'})
        break;
      default:
        break;
    }

    this._modalService.actionSheet('Actions', actions).pipe(
      filter((resp: IModalResponse) => resp.role == "submit"),
      map((resp: IModalResponse) => resp.data),
      ).subscribe((action: string) => {
        switch(action) {
          case 'delete-disconnected-listing':
            this._api.deleteInventoryListing((record as InventoryListing).ID).subscribe(resp => {
              this._modalService.success(`Listing deleted`)
              this._analytics.trackEvent('report-action', {reportType: 'disconnected-listing-report', reportId: this.data.metadata.ID, reportAction: 'delete', inventoryListingID: (record as InventoryListing).ID})
              this.onInitDisconnectedListings()
            })
            break;
          case 'reconnect-disconnected-listing':
            //update externalProductID and externalProductVariant and update status to 'active'
            this._modalService.open(ProductMatchComponent, {productVariantID: (record as InventoryListing).inventory.productVariantID, externalSaleChannelID: (record as InventoryListing).saleChannelID}, {cssClass: 'full-screen-y'}).pipe(
              filter(res => res != null),
              mergeMap((productMatch: ProductMatchLookup) => this._api.reconnectInventoryListing((record as InventoryListing).ID, productMatch.externalProductVariantID))
            ).subscribe(() => {
              this._modalService.success(`Listing reconnected`)
              this._analytics.trackEvent('report-action', {reportType: 'disconnected-listing-report', reportId: this.data.metadata.ID, reportAction: 'reconnect', inventoryListingID: (record as InventoryListing).ID})
              this.onInitDisconnectedListings()
            })
            break;
          case 'view-product':
            this._api.importProduct(record['productID']).subscribe((product: Product) => {
              this.createEvent('report-' + reportType, EventActionEnum.ViewProduct)
              const queryParams = {
                inventoryType: 'consignment'
              }

              let url = `inventory/product/${product.ID}`
              if (environment.screenType != 'mobile') {
                url += `/variants/${product.variants[0].ID}`
              }
              this._router.navigate([url], {queryParams})

              this.onCancel()

            })
            break;
          case 'view-stock-levels':
            this.createEvent('report-' + reportType, EventActionEnum.ViewProduct)

            const product = record['variant']['product'];
            const variant = record['variant']
            const inventoryRecord = new InventoryRecord({
              accountID: this.user.account.ID,
              account: this.user.account,
              product: product,
              variant: variant,
              virtual: false,
              quantity: null,
              status: 'active',
              warehouse: null,
              listings: this.user.account.saleChannels.map(channel =>
                new InventoryListing({
                  ID: null,
                  accountID: this.user.account.ID,
                  account: this.user.account,
                  saleChannel: channel,
                  saleChannelID: channel.ID,
                  status: 'active',
                  priceSourceName: null,
                  priceSourceMargin: null,
                  payout: null,
                  price: null,
                  product: channel.accountID == this.user.account.ID ? product : null,
                  productID: channel.accountID == this.user.account.ID ? product.ID : null,
                  variant: channel.accountID == this.user.account.ID ? variant : null,
                  variantID: channel.accountID == this.user.account.ID ? variant.ID : null,
                })
              )
            })

            const data = {
              product: product,
              inventoryType: 'stock',
              inventoryRecord: inventoryRecord,
              standalone: true
            }
            this._modalService.open(InventoryRecordComponent, data, {cssClass: 'full-screen-y'}).subscribe()
            break;
          default:
            break;
        }
      })

  }
}
