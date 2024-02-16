import {Component, OnInit, ViewChild} from '@angular/core';
import {IonSlides} from "@ionic/angular";
import {OfferChatComponent} from "../components/offer-chat/offer-chat.component";
import {OffersListComponent} from "../components/offers-list/offers-list.component";
import {MarketplaceOffer} from "../../shared/models/MarketplaceOffer";
import {ApiService} from "../../core/api.service";
import {ActivatedRoute, Router} from "@angular/router";
import {UserService} from "../../core/user.service";
import {ModalService} from "../../shared/modal/modal.service";
import {CometchatService} from "../../core/cometchat.service";
import { environment } from 'src/environments/environment'


@Component({
  selector: 'app-offers',
  templateUrl: './offers.page.html',
  styleUrls: ['./offers.page.scss'],
})
export class OffersPage implements OnInit {
//Child components
  //@ViewChild(IonBackButtonDelegate, { static: false }) backButton: IonBackButtonDelegate;
  @ViewChild('componentSlider')  componentSlider: IonSlides;
  @ViewChild(OfferChatComponent) offerChatComponent: OfferChatComponent;
  @ViewChild(OffersListComponent) offerListComponent: OffersListComponent;

  public environment = environment
  public isLoading = false

  public offers: MarketplaceOffer[] = []
  public selectedOffer: MarketplaceOffer

  public selectedTab = 'sent'

  // slider configs
  public slideOpts = {
    initialSlide: 0,
    allowSlideNext: false,
    allowSlidePrev: false,
  };

  //TODO: resolve cached pages issues
  public reusedPage = true



  constructor(
    private  _api: ApiService,
    private  _route: ActivatedRoute,
    private _router: Router,
    private  _user: UserService,
    private  _modalCtrl: ModalService,
    private _cometChat: CometchatService
  ) { }

  ngOnInit() {
    this._cometChat.loginUser((this._user.account.ID).toString(), this._user.deviceID)
  }




  //TODO: complete proper implementation with routing : Quick fix
  onBackClick(){
    if(environment.screenType == "mobile"){
      this.componentSlider.getActiveIndex().then(async index => {
        if (index == 1) {
          this.clearSelectedOffer()
          await this.componentSlider.lockSwipes(false)
          await this.componentSlider.slidePrev()
          await this.componentSlider.lockSwipes(true)
        } else {
          this._router.navigate([`marketplace`])
        }
      })
    }
    else{
      this._router.navigate([`marketplace`])
    }

  }


  /**
   * Listen to the group emitted by the groupList component
   * @param Event user
   */
  onOfferSelected(offer: any) {
    this.selectedOffer = offer

    if(offer){
      this._router.navigate([], {relativeTo: this._route, queryParams: {offer:offer.ID, type: this.offerListComponent.offersType}, queryParamsHandling: ''});
      this.offerChatComponent.loadChat(offer)
    }

    if(this.componentSlider && environment.screenType == 'mobile' && offer ){
      this.componentSlider.lockSwipes(false).then(async () => {
        await this.componentSlider.slideNext()
        await this.componentSlider.lockSwipes(true)
      })
    }
  }

  clearSelectedOffer(){
    this.selectedOffer = null
    this._router.navigate([], {relativeTo: this._route, queryParams: {offer:null, type: this.offerListComponent.offersType}, queryParamsHandling: ''});
  }

  onOfferRefreshed() {
    this.offerListComponent.onRefresh()
  }



}
