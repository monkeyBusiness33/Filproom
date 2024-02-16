import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { filter, map, mergeMap } from 'rxjs/operators';
import { IModalResponse, ModalService } from 'src/app/shared/modal/modal.service';
import { environment } from 'src/environments/environment';
import { PayoutSetupFormComponent } from '../payout-setup-form/payout-setup-form.component';
import { AddressContactPage } from 'src/app/orders/modals/address-contact/address-contact.page';
import { Address } from 'src/app/shared/models/Address.model';
import { UserService } from 'src/app/core/user.service';
import { SaleChannel } from 'src/app/shared/models/SaleChannel';
import { Warehouse } from 'src/app/shared/models/Warehouse.model';
import { ApiService } from 'src/app/core/api.service';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, merge, of } from 'rxjs';
import { Chart, registerables } from 'chart.js';
import * as moment from 'moment';

@Component({
  selector: 'app-integration',
  templateUrl: './integration.page.html',
  styleUrls: ['./integration.page.scss'],
})
export class IntegrationPage implements OnInit {
  public environment = environment
  public integrationTabsList: string[] = ['general', 'shipping', 'payouts']
  public currentSelectedTab = 'general';
  public retailerAccountID;
  public integrationName;
  public accountFulfillmentCentre: Warehouse; // consignor fulfillment centre to ship form items for consignment 
  public saleChannelsAvailable: SaleChannel[] = [] // list of sale channles available for the consignor

  @ViewChild('salesCanvas') private salesCanvas: ElementRef;
  @ViewChild('listingsAgeCanvas') private listingsAgeCanvas: ElementRef;
  public salesChart: any;
  public listingsAgeChart: any;

  public consignmentInfo;
  public stripeAccount;
  public bankAccount;
  public consignmentTier: string = 'bronze' //TODO: move inside consignmentInfo once refactored backend

  public isLoading: boolean = false;
  public shippingFaqs = [];
  public payoutFaqs = [];

  private salesChartData;
  private listingsChartData;

  constructor(
    private _modal: ModalService,
    public user: UserService,
    private _api: ApiService,
    private _route: ActivatedRoute,
    private _router: Router
  ) {
    Chart.register(...registerables);
    this._api.loadIntegrationFaqs().subscribe((res: any) => {
      this.shippingFaqs = res.filter(el => el.topic == 'shipping')
      this.payoutFaqs = res.filter(el => el.topic == 'payout')
    })
  }

  ngOnInit() {
    this.retailerAccountID = this._route.snapshot.queryParams.retailerAccountID;
    this.integrationName = this._route.snapshot.queryParams.integrationName;

    this.accountFulfillmentCentre = this.user.account.warehouses.find(wh => wh.fulfillmentCentre)
    this.saleChannelsAvailable = this.user.account.saleChannels.filter(sc => sc.accountID == this.retailerAccountID)
    this.consignmentTier = this.saleChannelsAvailable[0].tier

    //get analytics data
    this._api.getAccountAnalytics(this.user.account.ID, 'sales', {interval: 'weekly', accumulation: 'periodic', saleChannelID: this.saleChannelsAvailable.map(sc => sc.ID).join(",") })
    .subscribe(res => {
      this.salesChartData = res;
      
    })

    this._api.getAccountAnalytics(this.user.account.ID, 'listings-age', {interval: 'weekly', accumulation: 'periodic', saleChannelID: this.saleChannelsAvailable.map(sc => sc.ID).join(",") }).subscribe(res => {
      this.listingsChartData = res;

    })

    this._api.getConsignmentInfo(this.retailerAccountID, this.user.account.ID).pipe(
      mergeMap((resp) => {
        this.consignmentInfo = resp
        const queries = {
          stripe: this.consignmentInfo.stripeAccountID ? this._api.getStripeAccount(this.user.account.ID) : of(null),
          bank: this.consignmentInfo.revolutCounterpartyID ? this._api.getBankAccount(this.retailerAccountID, this.user.account.ID, this.consignmentInfo.revolutCounterpartyID) : of(null)
        }
        return forkJoin(queries)
      })
    )
      .subscribe((resp) => {
        this.stripeAccount = resp['stripe']
        this.bankAccount = resp['bank']
      })

    this.isLoading = false;
  }

  ionViewDidEnter() {
    // called everytime the general tab is displayed - this because to display graphs have to reference the HTML element which exists only when the general tab is selectd
    // need to wait for the charts elements to render before initiating the charts
    setTimeout(() => this.displayAnalytics(), 250)

    // if user opens edit ldn integration from stripe onboarding. Process the request and refresh
    if (this._route.snapshot.queryParamMap.get('code')) {
      this.isLoading = true
      const stripeAuthCode = this._route.snapshot.queryParamMap.get('code')
      this._api.createBankAccount(3, this.user.account.ID, {
        gateway: 'stripe',
        stripeAuthID: stripeAuthCode
      }).subscribe((resp) => {

        // if something broke and doesn't return the consignment record updated
        if (!resp.ID) {
          resp.includes('code expired') ? this._modal.alert('The stripe account authentication code has expired, please create another stripe account') : null
          resp.includes('does not exist') ? this._modal.alert('The stripe authentication code does not exist') : null
        }

        const params = { ...this._route.snapshot.queryParams };
        delete params.code
        this._router.navigate([], { queryParams: params });
        this.ngOnInit()
      })
    }
  }

  /**
   * GENERAL TAB
   */

  onRefresh() {
    this.isLoading = true
    this._api.getAccountInfo().subscribe(() => this.ngOnInit())
  }

  onToggleSaleChannelStatus(saleChannel: SaleChannel, event: any) {
    let params: any = {};
    event.checked ? params.status = 'active' : params.status = 'vacation'

    let queriesChain = of(null)
    // if turning off the listing, ask for confirmation since it triggers background workflow
    if (!event.checked) {
      queriesChain = this._modal.input({ title: 'confirm', subtitle: `This action will remove all of your listings on ${saleChannel.title}. Type <b>PROCEED</b> in order to proceed`, type: 'string' }).pipe(
        filter(resp => resp && resp == "proceed")
      )
    }

    queriesChain.pipe(
      mergeMap(() => this._api.updateSaleChannelConsignmentStatus(this.retailerAccountID, this.user.account.ID, saleChannel.ID, params))
    )
      .subscribe(res => {
        if (params.status == 'active') {
          this._modal.success(`Sale Channel ${saleChannel.title} is now active`);
        } else {
          this._modal.success(`Turning off listings for Channel ${saleChannel.title}.. this might take a while`);
        }
        this.onRefresh()
      })
  }

  displayAnalytics() {
    //render sales chart
    const ctx = this
    this.salesChart = new Chart(this.salesCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: this.salesChartData.x.map(date => moment.utc(date).format('D MMM')),
        datasets: [
          {
            label: 'Amount',
            data: this.salesChartData.y,
            maxBarThickness: 10,
            backgroundColor: 'rgba(0, 70, 253, 0.8)',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            ticks: {
              // Include a dollar sign in the ticks
              callback: function(value, index, ticks) {
                  return `${ctx.user.account.currencySymbol} ${value}`
              }
            }
          }
        }
      }
    });

    //render listings data
    this.listingsAgeChart = new Chart(this.listingsAgeCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: this.listingsChartData.x.map(date => {
          const weeksNumber = moment().diff(date, 'weeks')
          return weeksNumber == 0 ? 'this week' : `${weeksNumber} week${weeksNumber > 1 ? 's' : ''} ago`
        }),
        datasets: [
          {
            label: 'Listings',
            data: this.listingsChartData.y,
            maxBarThickness: 10,
            backgroundColor: 'rgba(0, 70, 253, 0.8)',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  }

  /**
   * SHIPPING TAB
   */

  onEditShipping() {
    this._modal.open(AddressContactPage, { address: this.accountFulfillmentCentre.address, formOnly: true }).pipe(
      filter(res => res)
    ).subscribe((address: Address) => {
      this._modal.success('Address Updated. Refresh the page to see the changes');
      this.onRefresh()
    })
  }

  /**
   * PAYOUT TAB
   */


  onLinkStripeClick(linkName: string) {
    //used to generate the onboarding link for a new account
    const params = {}
    this._api.getStripeLinks(this.user.account.ID, linkName, params).subscribe((linkUrl) => {
      window.open(linkUrl, '_blank');
    })
  }

  onBankAccountConnect() {
    this._modal.open(PayoutSetupFormComponent, { retailerAccountID: this.retailerAccountID }).pipe(
      filter(res => res)
    ).subscribe(res => {
      this.onRefresh()
    })
  }

  onBankAccountDisconnect() {
    this._api.removeBankAccount(this.retailerAccountID, this.user.account.ID).subscribe(resp => {
      this._modal.success('Bank Account disconnected')
      this.onRefresh()
    })
  }

  /**
   * MISC
   */

  integrationTabsChanged(evt) {
    this.currentSelectedTab = evt.detail.value;
    if(this.currentSelectedTab == 'general'){
      // called everytime the general tab is displayed - this because to display graphs have to reference the HTML element which exists only when the general tab is selectd
      // need to wait for the charts elements to render before initiating the charts
      setTimeout(() => this.displayAnalytics(), 250)
    }
  }

  onShowTerms() {
    window.open("https://www.fliproom.io/terms-conditions", '_blank')
  }

  onIntegrationOptionsClick() {
    const actions = []
    actions.push({ icon: 'info', title: 'Terms & Conditions', description: '', disabled: false, key: 'terms' })

    this._modal.actionSheet('Actions', actions).pipe(
      filter((resp: IModalResponse) => resp.role == "submit"),
      map((resp: IModalResponse) => resp.data),
    ).subscribe((action: string) => {
      switch (action) {
        case 'terms':
          this.onShowTerms()
          break;
      }
    })
  }


}
