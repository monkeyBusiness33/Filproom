import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from 'src/environments/environment';
import { UserService } from 'src/app/core/user.service';
import { SaleChannel } from 'src/app/shared/models/SaleChannel';
import { ApiService } from '../core/api.service';
import {filter, map, mergeMap} from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { AnalyticsService } from '../core/analytics.service';
import { ModalService } from '../shared/modal/modal.service';
import {SaleChannelFormComponent} from "../sale-channels/modals/sale-channel-form/sale-channel-form.component";
import {FeedbackInterfaceComponent} from "../shared/modal/feedback-interface/feedback-interface.component";

@Component({
  selector: 'app-integrations',
  templateUrl: './integrations.page.html',
  styleUrls: ['./integrations.page.scss'],
})
export class IntegrationsPage implements OnInit {
  public environment = environment
  public saleChannels: SaleChannel[] = this.user.account.saleChannels
  public isLoading: boolean = false;

  public integrations = []
  public otherIntegration;
  public isDarkTheme = window.matchMedia('(prefers-color-scheme: dark)')

  constructor(
    private _router: Router,
    public user: UserService,
    public _api: ApiService,
    private _analytics: AnalyticsService,
    private _modal: ModalService
  ) {
    //check if account has access to the edit ldn integration
    if (this.user.account.saleChannels.find(sc => (sc.accountID == 3 && this.user.account.ID != 3))) {
      this.integrations.push({
        key: 'the-edit-ldn',
        setupCompleted: true,
        analytics: {
          items: 0,
          sales: 0,
          pending: 0
        }
      })
    }

    if (this.user.isBetaUser('integrations-laced')){
      this.integrations.push({
        key: 'laced',
        setupCompleted: this.user.account.saleChannels.find(sc => sc.platform == 'laced') ? true : false,
        analytics: {
          items: 0,
          sales: 0,
          pending: 0
        }
      })
    }
  }

  ngOnInit() {
    this.onLoadData();
  }

  onIntegrationClick(integration) {
    if (integration.setupCompleted) {
      this._onOpenIntegration(integration.key)
    } else if (integration.key == 'laced' && this.user.isBetaUser('integrations-laced') && !integration.setupCompleted) {
      this._onSetupIntegration(integration.key)
    }
    else {
      this._onRequestIntegration(integration.key)
    }
  }

  _onOpenIntegration(integrationKey: string){
    console.log('_onOpenIntegration', integrationKey)
    switch (integrationKey) {
      case 'the-edit-ldn':
        this._router.navigate([`/integrations/${integrationKey}`], { queryParams: { retailerAccountID: 3, integrationName: 'The Edit LND' }})
        break;
      case 'laced':
        //TODO
        break;
    }
  }

  _onSetupIntegration(integrationKey: string) {
    console.log('_onSetupIntegration', integrationKey)
    switch (integrationKey) {
      case 'laced':
        this._modal.open(SaleChannelFormComponent, {saleChannel: {platform: 'laced'}}, {}).pipe(
          filter(res => res),
          mergeMap((resp) => {
            return this._api.getAccountInfo()
          })
        ).subscribe((user) => {
          const lacedIntegration = this.integrations.find(i => i.key == 'laced')
          lacedIntegration.setupCompleted = true;
          this.onLoadData();
        })
        break;
    }
  }

  _onRequestIntegration(integrationKey: string) {
    console.log('_onRequestIntegration', integrationKey)

    switch (integrationKey) {
      case 'laced':
        this._analytics.trackEvent('integration_request', { platform: integrationKey })
        let modalData = {
          title: 'Select Laced Subscription Tier',
          id: 'laced-subscription-q4', optionCards: [
            {
              title: '🪙 Starter',
              id: 'laced-starter',
              description: 'Entry level features for resellers looking to up their game',
              list: ['20-50 laced listings', 'Sales syncing', 'Product mapping'],
              suffix: '£14.99/mo'
            },
            {
              title: '⚜️ Pro',
              id: 'laced-pro',
              description: 'Advanced features for resellers looking to scale their business',
              list: ['50-100 laced listings', 'All starter features', 'Laced to Fliproom syncing'],
              suffix: '£24.99/mo'
            },
            {
              title: '💎 Elite',
              id: 'laced-elite',
              description: 'Premium features for resellers looking to dominate the market',
              list: ['100+ laced listings', 'All pro features', 'Undercutting recommendations'],
              suffix: '£29.99/mo'
            },
          ],
          mode: 'option-cards',
          submitOnOptionClick: true,
          hideSubmit: true
        }
        //Open the modal with the options and track the notification card click
        this._modal.open(FeedbackInterfaceComponent, modalData,{} ).subscribe((res) => {})
        break;
      case 'other':
        this._analytics.trackEvent('integration_request', {platform: this.otherIntegration})
        break;
      default:
        this._analytics.trackEvent('integration_request', { platform: integrationKey })
        break;
    }
  }

  onLoadData() {
    //populate analytics for integrations completed 
    for (const integration of this.integrations) {
      if (!integration.setupCompleted) continue

      const inventoryListingsQuery = {
        'accountID': this.user.account.ID,
      }

      const salesQuery = {
        'accountID': this.user.account.ID,
        'typeID': 4
      }
      const salesPendingQuery = {
        'accountID': this.user.account.ID,
        'typeID': 4,
        'status': 'pending,fullfil'
      }
      switch (integration.key) {
        case 'the-edit-ldn':
          const editLDnSaleChannel = this.user.account.saleChannels.find(sc => sc.accountID == 3 && sc.platform == 'shopify')
          inventoryListingsQuery['saleChannel.ID'] = editLDnSaleChannel.ID
          salesQuery['saleChannel.accountID'] = 3
          salesPendingQuery['saleChannel.accountID'] = 3
          break;
        case 'laced':
          const lacedSaleChannel = this.user.account.saleChannels.find(sc => sc.platform == 'laced')
          inventoryListingsQuery['saleChannel.ID'] = lacedSaleChannel.ID
          salesQuery['saleChannel.ID'] = lacedSaleChannel.ID
          salesPendingQuery['saleChannel.ID'] = lacedSaleChannel.ID
          break;
      }

      //fetch data for the integration
      this._api.getInventoryListings(0, 999, null, inventoryListingsQuery).pipe(
        map((resp) => {
          const listings = resp.data;
          const totalQuantity = listings.reduce((total, listing) => total + listing.inventory.quantity, 0);
          return totalQuantity;
        })
      )
      .subscribe((totalQuantity) => {
        integration.analytics.items = totalQuantity;
      })

      this._api.getOrders(0, 999, null, salesQuery).pipe(
        map((resp) => resp.count)
      )
      .subscribe((salesCount) => {
        integration.analytics.sales = salesCount;
      })

      // Load pending items
      this._api.getOrders(0, 999, null, salesPendingQuery).pipe(
        map((resp) => resp.count)
      )
      .subscribe((salesPendingCount) => {
        integration.analytics.pending = salesPendingCount;
      })
    }
  }
}
