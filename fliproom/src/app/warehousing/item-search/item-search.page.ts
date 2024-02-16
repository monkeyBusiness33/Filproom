import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter, mergeMap } from 'rxjs/operators';

import { ApiService } from 'src/app/core/api.service';
import { ScannerResponse } from 'src/app/core/barcode-scanner.service';
import { PluginsService } from 'src/app/core/plugins.service';
import { ModalService } from 'src/app/shared/modal/modal.service';
import { Item } from 'src/app/shared/models/Item.model';
import { IItemSearchFilter, ItemSearchFilterComponent } from '../item-search-filter/item-search-filter.component';
import { AnalyticsService } from 'src/app/core/analytics.service';

@Component({
  selector: 'app-item-search',
  templateUrl: './item-search.page.html',
  styleUrls: ['./item-search.page.scss'],
})
export class ItemSearchPage implements OnInit {
  public isLoading: boolean = false;

  public itemsSearchResults: Item[];
  private activeSubs: Subscription[] = []

  constructor(
    private _plugins: PluginsService,
    private _api: ApiService,
    private _modalCtrl: ModalService,
    private _router: Router,
    private _route: ActivatedRoute,
    private _analytics: AnalyticsService
  ) {
    this._router.routeReuseStrategy.shouldReuseRoute = () => false;
  }

  ngOnInit() {

    this._route.queryParams.pipe(
      filter(params => Object.keys(params).length != 0),
      mergeMap(params => {
        this.isLoading = true
        this.itemsSearchResults = undefined
        return this._api.getItemsList(0, 30, 'id:desc', params)
      })
    ).subscribe((res) => {
      this.isLoading = false
      this.itemsSearchResults = (res.data as Item[])
    })
  }

  ionViewWillEnter() {
    // subscribe to barcode scan
    const sub2 = this._plugins.scanner.scannerReadListener.subscribe((scannerResponse: ScannerResponse) => {
      const barcode = scannerResponse.data.toLowerCase().trim()

      console.log(scannerResponse.data.toLowerCase().trim())
      this.isLoading = true
      this._api.getItemsList(0, 100, 'id:desc', {barcode: barcode}).subscribe(res => {
        this.isLoading = false
        if (res.count == 0) {
          this._modalCtrl.warning(`No item with Barcode ${barcode}`)
          return
        }

        this.onItemSelected(res.data[0] as Item)
      })
    })

    this.activeSubs.push(sub2)
  }

  onStartBarcodeScanner() {
    this.itemsSearchResults = undefined
    this._plugins.scanner.setReadMode();
  }

  ionViewWillLeave() {
    this.activeSubs.map(sub => sub.unsubscribe())
  }

  onSearchItemClick() {
    // open search form
    this._modalCtrl.open(ItemSearchFilterComponent).subscribe(params => {
      this._analytics.trackEvent('item_search')
      this._router.navigate(['/warehousing/item-search'], {queryParams: params})
    })
  }

  onItemSelected(item: Item) {
    this._router.navigate([`/items/${item.ID}`])
  }

}
