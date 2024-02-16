import { Component, OnInit } from '@angular/core';
import { ApiService } from '../core/api.service';
import { UserService } from '../core/user.service';
import { ReportMetadata } from '../shared/models/ReportMetadata';
import { ModalService } from '../shared/modal/modal.service';
import { ViewReportComponent } from './modals/view-report/view-report.component';
import { AnalyticsService } from '../core/analytics.service';
import { environment } from 'src/environments/environment';
import {FeedbackInterfaceComponent} from "../shared/modal/feedback-interface/feedback-interface.component";
import {forkJoin, merge, of, timer} from "rxjs";
import {filter, mergeMap} from "rxjs/operators";
import {ActivatedRoute, Router} from "@angular/router";
import {ProductSearchComponent} from "../shared/components/product-search/product-search.component";
import { announcements } from '../core/announcements';
import { EventActionEnum } from '../shared/enums/event-action.enum';

//create interface
export interface Notification {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  buttonText: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
})


export class DashboardPage implements OnInit {
  public analytics = [
    {id: 'sales-amount',       title: 'Sales Amount',       value: null, valueChange: null, valueType: 'currency', info: 'The sum of all sales on the platform'},
    {id: 'inventory-value',    title: 'Inventory Value',    value: null, valueChange: null, valueType: 'currency', info: 'The total current stock value. Calculated as the sum of all inventory costs set multiplied by each item in stock. For an accurate number, set the cost to the inventory records'},
    {id: 'unrealized-profits', title: 'Unrealized Profits', value: null, valueChange: null, valueType: 'currency', info: 'The current unrealized profit. If you would sell all the stock today at the lowest payout, this is how much profit you would make. Calculated as the difference between the minimum payout and inventory cost and then multiplied for each item in stock'},
    {id: 'inventory-quantity', title: 'Items in Stock',     value: null, valueChange: null, valueType: 'number', info: 'The total number of items in stock'},
  ]

  public reports: ReportMetadata[] = []
  public math = Math
  public slidesPerView: number = environment.screenType == 'desktop' ? 2 : 1; // number of analytics cards to display per slide. mobile: 1, web: 2
  public notificationCards: Notification[] = [

    ]

  private userSatisfactionModal = {
      title: 'How are you finding the platform?',
      id: 'user-satisfaction',
      mode: 'feedback-bulk',
      topics: [
        {title: 'Orders', id: 'orders'},
        {title: 'Inventory' , id: 'inventory'},
        {title: 'Notifications' , id: 'notifications'},
        {title: 'User Interface' , id: 'ui'},
      ]
    }
  private lacedInterestModal = {
    title: 'Select the subscription that fits you best',
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
    hideSubmit: true,
    showInterestDismissal: true
  }

  constructor(
    private _api: ApiService,
    public user: UserService,
    private _router: Router,
    private _modalCtrl: ModalService,
    private _analytics: AnalyticsService,
    private _route: ActivatedRoute,


  ) { }

  ngOnInit() {
    this._api.getAccountAnalytics(this.user.account.ID, 'sales', {interval: 'monthly', accumulation: 'cumulative'}).subscribe((res: any) => {
      // calculate the value change using the last two values: most recent (last element in the list) and second most recent
      const newValue = res.y[res.y.length - 1]
      const prevValue = res.y[res.y.length - 2]
      const valueChange = prevValue != 0 ? ((newValue - prevValue) / this.math.abs(prevValue)) : 0
      this.analytics.find(a => a.id === 'sales-amount').value = newValue
      this.analytics.find(a => a.id === 'sales-amount').valueChange = valueChange
    })

    this._api.getAccountAnalytics(this.user.account.ID, 'inventory-value', {interval: 'monthly', accumulation: 'cumulative'}).subscribe((res: any) => {
      // calculate the value change using the last two values: most recent (last element in the list) and second most recent
      const newValue = res.y[res.y.length - 1]
      const prevValue = res.y[res.y.length - 2]
      const valueChange = prevValue != 0 ? ((newValue - prevValue) / this.math.abs(prevValue)) : 0
      this.analytics.find(a => a.id === 'inventory-value').value = newValue
      this.analytics.find(a => a.id === 'inventory-value').valueChange = valueChange
    })

    this._api.getAccountAnalytics(this.user.account.ID, 'unrealized-profits', {interval: 'monthly', accumulation: 'cumulative'}).subscribe((res: any) => {
      // calculate the value change using the last two values: most recent (last element in the list) and second most recent
      const newValue = res.y[res.y.length - 1]
      const prevValue = res.y[res.y.length - 2]
      const valueChange = prevValue != 0 ? ((newValue - prevValue) / this.math.abs(prevValue)) : 0
      this.analytics.find(a => a.id === 'unrealized-profits').value = newValue
      this.analytics.find(a => a.id === 'unrealized-profits').valueChange = valueChange
    })

    this._api.getAccountAnalytics(this.user.account.ID, 'inventory-quantity', {interval: 'monthly', accumulation: 'cumulative'}).subscribe((res: any) => {
      // calculate the value change using the last two values: most recent (last element in the list) and second most recent
      const newValue = res.y[res.y.length - 1]
      const prevValue = res.y[res.y.length - 2]
      const valueChange = prevValue != 0 ? ((newValue - prevValue) / this.math.abs(prevValue)) : 0
      this.analytics.find(a => a.id === 'inventory-quantity').value = newValue
      this.analytics.find(a => a.id === 'inventory-quantity').valueChange = valueChange
    })

    this._api.getAccountReports(this.user.account.ID, {limit: 3}).subscribe((reports: ReportMetadata[]) => this.reports = reports)

    //Skip announcements on first session to avoid overwhelming the user
    if (this._route.snapshot.queryParams.firstSession != 'true') {
      timer(1000).subscribe(() => this.showAnnouncements())
    }
  }

  showAnnouncements() {
    let availableAnnouncements = announcements.filter(announcement => announcement.display);


    forkJoin({
      events: this._api.getAllEvents(0, 999, null, {
        resource: availableAnnouncements.map(annoucement => annoucement.id).join(','),
        action: EventActionEnum.Completed + ',' + EventActionEnum.NotInterested
      }),
      inventoryRecords: this._api.getInventory(0,1,null, {accountID: this.user.account.ID})
    })
    .subscribe((results: any) => {
      //remove announcements that the user already completed or said to not be interested
      availableAnnouncements = availableAnnouncements.filter(announcement => !results.events.rows.find(e => e.resource == announcement.id));
      //skip inventory-upload-reminder announcement if user has inventory
      if (results.inventoryRecords.count != 0) {
        availableAnnouncements = availableAnnouncements.filter(announcement => announcement.id != 'inventory-upload-reminder')
      }

      const announcementToDisplay = availableAnnouncements[0]
      if(!announcementToDisplay) return

      const availableBestSellingProductsReport = this.reports.find(report => report.type == 'best-selling-products'  && report.viewedAt == null)

      if(announcementToDisplay.id === 'user-satisfaction'){
        this.showAnnouncement(announcementToDisplay)
        .subscribe((response) => {
          if (response == "submitted") {
            this.createEvent(announcementToDisplay.id, EventActionEnum.Completed)
          }
        })
      }
      // Add additional filtering logic here to not have to fetch reports data twice
      else if(announcementToDisplay.id === 'best-products-report-announcement' && availableBestSellingProductsReport ) {
        this.showAnnouncement(announcementToDisplay)
        .subscribe((response) => {
          if (response == "submitted") {
            this.createEvent(announcementToDisplay.id, EventActionEnum.Completed)
          }
        })
      }
      else if(announcementToDisplay.id === 'laced-interest' && this.user.isBetaUser('laced-pricing-announcement')) {
        this.showAnnouncement(announcementToDisplay)
        .subscribe((response) => {
          if (response == "submitted") {
            this.createEvent(announcementToDisplay.id, EventActionEnum.Completed)
          }
        })
      }
      else if(announcementToDisplay.id === 'inventory-upload-reminder') {
        this.showAnnouncement(announcementToDisplay)
        .pipe(
          filter((product) => product)
        )
        .subscribe((product) => {
          const params = {
            formType: 'create',
            inventoryType: 'stock',
            source: 'inventoryUploadReminder'
          }
          this._router.navigate([`inventory/bulk/create/product/${product.ID}`], {queryParams: params})
        })
      }
    });
  }

  showAnnouncement(announcement) {
    this.createEvent(announcement.id, EventActionEnum.Viewed)
    return this._modalCtrl.confirm(announcement.content,{cancelButtonText:"No, thanks", confirmButtonText:"Yes", title: announcement.title}).pipe(
      mergeMap((res) => {
        if (res){
          this.createEvent(announcement.id, EventActionEnum.Interested)
          switch (announcement.id) {
            case 'user-satisfaction':
              return this._modalCtrl.open(FeedbackInterfaceComponent, this.userSatisfactionModal, {cssClass: 'full-screen-y'})
            case 'laced-interest':
              return this._modalCtrl.open(FeedbackInterfaceComponent, this.lacedInterestModal, {cssClass: 'full-screen-y'})
            case 'best-products-report-announcement':
              const availableBestSellingProductsReport = this.reports.find(report => report.type == 'best-selling-products'  && report.viewedAt == null)
              if(availableBestSellingProductsReport) {
                this.onReportClick(availableBestSellingProductsReport)
              }
              return of('submitted')
            case 'inventory-upload-reminder':
              return this._modalCtrl.open(ProductSearchComponent, {consignment: this.user.account.externalSaleChannels.length > 0, redirectTo: 'inventory', catalogueSelected: (this.user.account.externalSaleChannels.length > 0 && this.user.account.internalSaleChannels.length == 0)? 'consignment': null}, {cssClass: 'full-screen-y'})
          }
        } else if(res == false){
          this.createEvent(announcement.id, EventActionEnum.NotInterested)
          return of(null)
        } else {
          this.createEvent(announcement.id, EventActionEnum.Dismissed)
          return of(null)
        }
      }
    )
    )
  }

  createEvent(resource: string, action: EventActionEnum) {
    const body = { resource, action };
    this._api.createEvent(body).subscribe((resp) => {});
  }

  onAnalayticsCardClick(analytics: any) {
    this._modalCtrl.alert(analytics.info).subscribe(() => {})
  }

  onReportClick(report: ReportMetadata) {
    this._api.getReportByID(report.ID).subscribe((reportData: Object) => {
      report?.type ? this.createEvent(report.type + '-report', EventActionEnum.Opened) : null
      this._modalCtrl.open(ViewReportComponent, {data: reportData, metadata: report}, {cssClass: 'full-screen-y'})
    })
  }

}
