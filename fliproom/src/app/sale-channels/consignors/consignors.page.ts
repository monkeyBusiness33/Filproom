import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from 'src/app/core/api.service';
import { Account, UserService } from 'src/app/core/user.service';
import { FliproomListComponent } from 'src/app/shared/fliproom-list/fliproom-list.component';
import { ModalService } from 'src/app/shared/modal/modal.service';
import { SaleChannel } from 'src/app/shared/models/SaleChannel';
import { DataRequest, TableConfiguration, TableWrapperComponent } from 'src/app/shared/table-wrapper/table-wrapper.component';
import { environment } from 'src/environments/environment';
import { ConsignorFormComponent } from '../modals/consignor-form/consignor-form.component';

@Component({
  selector: 'app-consignors',
  templateUrl: './consignors.page.html',
  styleUrls: ['./consignors.page.scss'],
})
export class ConsignorsPage implements OnInit {
  @ViewChild('tableWrapper') tableWrapper: TableWrapperComponent;
  @ViewChild('fliproomList') fliproomList: FliproomListComponent;

  public environment = environment
  public buttons = [
    {label: 'invite', icon: 'bolt', id: 'invite'}
  ]

  public tableConfigs: TableConfiguration = new TableConfiguration({
    columnsConfig: [
      {reference: 'name',                displayedName: 'Name',         dataType: 'string'},
      {reference: 'status',              displayedName: 'Status',         dataType: 'string'},
      {reference: 'tier',                displayedName: 'Tier',         dataType: 'string'},
    ],
    tableKey: 'consignors',
    showColumnsSelection: true,
    showAdvancedFilter: true,
    rowHoverable: true,
    emptyTablePlaceholder: 'No Consignors Available',
    placeholderButtonText: 'Send Invite',
    dataSourceFnName: 'getOrders' // pass this to allow table download
  })

  public saleChannel: SaleChannel
  public dataRequested;

  constructor(
    private _route: ActivatedRoute,
    private _api: ApiService,
    private _modalCtrl: ModalService,
    public user: UserService
  ) { }

  ngOnInit() {
    this._api.getSaleChannelByID(parseInt(this._route.snapshot.paramMap.get('saleChannelID'))).subscribe((saleChannel: SaleChannel) => {
      this.saleChannel = saleChannel
    })
  }

  onRefresh() {
    this.tableWrapper ? this.tableWrapper.refresh() : null
    this.fliproomList ? this.fliproomList.refresh() : null
  }

  onDataRequest(evt: DataRequest): void {
    this._api.getSaleChannelConsignors(parseInt(this._route.snapshot.paramMap.get('saleChannelID')), evt.pageIdx, evt.pageSize, evt.sort, evt.params).subscribe((resp) => {
      this.dataRequested = resp;
    });
  }

  onRowClick(consignor) {
    this._modalCtrl.open(ConsignorFormComponent, {consignor: consignor, saleChannel: this.saleChannel}).subscribe(res => {
      this.onRefresh()
    })
  }

  onButtonClick(buttonId: string) {
    if (this.user.account.isConsignor && buttonId == 'invite') {
      this._modalCtrl.info(`This function is currently unavailable for your account`)
      return
    }

    if (buttonId == 'invite') {
      navigator.clipboard.writeText(`https://app.fliproom.io/signup?consignInvite=${this.user.account.name.replace(/\s/g, '-')}`)
      this._modalCtrl.info(`Invitation Link copied to clipboard`)
    }
  }

}
