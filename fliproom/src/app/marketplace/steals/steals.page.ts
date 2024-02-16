import {Component, OnInit, ViewChild} from '@angular/core';
import {FliproomListComponent} from "../../shared/fliproom-list/fliproom-list.component";
import { environment } from 'src/environments/environment';
import {DataRequest} from "../../shared/table-wrapper/table-wrapper.component";
import {ApiService} from "../../core/api.service";
import {ActivatedRoute, Router} from "@angular/router";
import {ModalService} from "../../shared/modal/modal.service";
import {UserService} from "../../core/user.service";
import {MarketplaceListing} from "../../shared/models/MarketplaceList";


@Component({
  selector: 'app-steals',
  templateUrl: './steals.page.html',
  styleUrls: ['./steals.page.scss'],
})
export class StealsPage implements OnInit {

  @ViewChild('fliproomList') fliproomList: FliproomListComponent;
  public dataRequested;
  public isLoading: boolean =  true;
  public environment = environment

  constructor(
    private _api: ApiService,
    private _route: ActivatedRoute,
    private _modalCtrl: ModalService,
    private _router: Router,
    public user: UserService
  ) {
  }

  ngOnInit() {
  }

  onRefresh() {
    this.fliproomList ? this.fliproomList.refresh() : null
  }

  onDataRequest(evt: DataRequest): void {
    evt.params['user.accountID'] = `!${this.user.account.ID}`
    evt.params['steal'] = true
    evt.params['type'] = 'WTS'
    this._api.getMarketplaceListings(evt.pageIdx, evt.pageSize, evt.sort, evt.params).subscribe((resp) => {
      this.isLoading = false
      this.dataRequested = resp;
    });
  }

  onRowClick(listing: MarketplaceListing) {
    this._router.navigate(['/marketplace/detail/' + listing.ID])
  }

}
