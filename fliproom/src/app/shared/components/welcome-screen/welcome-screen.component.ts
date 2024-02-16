import { Component, OnInit } from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import { ModalController } from '@ionic/angular';
import { AnalyticsService } from 'src/app/core/analytics.service';
import { UserService } from 'src/app/core/user.service';

@Component({
  selector: 'app-welcome-screen',
  templateUrl: './welcome-screen.component.html',
  styleUrls: ['./welcome-screen.component.scss'],
})
export class WelcomeScreenComponent implements OnInit {

  constructor(
    private _router: Router,
    private _user: UserService,
    private _modalCtrl: ModalController,
    private _route: ActivatedRoute,
    private _analytics: AnalyticsService
  ) {

  }

  ngOnInit() {}

  onSellItemClick() {
    const params = {
      warehouse: 'all'
    }

    //right now tour only available only for consignors
    const consignmentSaleChannel = this._user.account.saleChannels.find(sc => sc.accountID != this._user.account.ID)
    if (consignmentSaleChannel) {
      params['tour'] = 'sell-item'
      this._analytics.trackEvent('tour_start', {name: 'sell-item'})
    }

    //if not consignor, send to public products to import
    this._router.navigate(['/inventory'], {queryParams: params})
    this._modalCtrl.dismiss();

  }

  onExploreClick() {
    //carry firstSession param to dashboard
    if(this._route.snapshot.queryParams.firstSession == 'true'){
      this._router.navigate(['/dashboard'], {queryParams: {firstSession: true}})
    }
    this._modalCtrl.dismiss();

  }

}
