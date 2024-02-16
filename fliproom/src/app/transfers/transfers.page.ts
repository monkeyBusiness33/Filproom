import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from 'src/environments/environment';
import { ApiService } from '../core/api.service';
import { UserService } from '../core/user.service';
import { FliproomListComponent } from '../shared/fliproom-list/fliproom-list.component';
import { ModalService } from '../shared/modal/modal.service';
import { Order } from '../shared/models/Order.model';
import { TableWrapperComponent, TableConfiguration, DataRequest } from '../shared/table-wrapper/table-wrapper.component';

@Component({
  selector: 'app-transfers',
  templateUrl: './transfers.page.html',
  styleUrls: ['./transfers.page.scss'],
})
export class TransfersPage implements OnInit {
  @ViewChild('tableWrapper') tableWrapper: TableWrapperComponent;
  @ViewChild('fliproomList') fliproomList: FliproomListComponent;

  public environment = environment

  public tableConfigs: TableConfiguration = new TableConfiguration({
    columnsConfig: [
      {reference: 'createdAt',                 displayedName: 'Created At',    dataType: 'date'},
      {reference: 'ID',                        displayedName: 'ID',            dataType: 'string'},
      {reference: 'user.name',              displayedName: 'Created By',    dataType: 'string'},
      {reference: 'reference1',                displayedName: 'Reference',     dataType: 'string'},
      {reference: 'consignor.fullName',            displayedName: 'Origin',        dataType: 'string'},
      {reference: 'consignee.fullName',            displayedName: 'Destination',   dataType: 'string'},
      {reference: 'quantity',                  displayedName: 'Quantity',      dataType: 'number'},
      {reference: 'status.name',               displayedName: 'Status',        dataType: 'string'},
      {reference: 'tags',                      displayedName: 'Tags',          dataType: 'string'},
    ],
    tableKey: 'transfers',
    showColumnsSelection: true,
    showAdvancedFilter: true,
    rowHoverable: true,
    emptyTablePlaceholder: 'No Transfers Available',
    dataSourceFnName: 'getOrders' // pass this to allow table download
  })

  public tabsList: string[] = ['inbound', 'outbound']
  public currentSelectedSegment: string = 'inbound'
  public dataRequested;
  public buttons = []

  constructor(
    public user: UserService,
    public _api: ApiService,
    private _router: Router,
    private _route: ActivatedRoute,
    private _modalCtrl: ModalService
  ) {

    this.buttons.push({label: 'new transfer', icon: 'add_box', id: 'add-transfer'})
    //if (this.user.iam.service.transfer) {
    //}
    this._route.queryParams.subscribe(p => {
      // if missing order type to disaply - redirect to inbound
      if (!p.type) {
        this._router.navigate(['transfers'], {queryParams: {stream: 'inbound'}})
        return
      }

      this.currentSelectedSegment = p.stream

      this.tableWrapper ? this.tableWrapper.ngOnInit() : null
      this.onRefresh()
    })
  }

  ngOnInit(): void {
  }

  onRefresh() {
    this.tableWrapper ? this.tableWrapper.refresh() : null
    this.fliproomList ? this.fliproomList.refresh() : null
  }

  onOpenHelp() {
  }

  onButtonClick(buttonId: string) {
    if (buttonId == 'add-transfer') {
      this._router.navigate(['/transfers/create'], {replaceUrl: true})
    }
  }

  /**
   * event = index of mat-tab
   * 0 : outbound
   * 1: inbound
   * 2: transfers
   * changes the query parameter of the url and refresh table
   * to reflect changes
   * @param event
   */
   onSegmentChanged(evt){
    this.currentSelectedSegment = evt.detail.value
    this._router.navigate(['/transfers'], {queryParams: {stream: this.currentSelectedSegment}})
    this.onRefresh()
  }

  onDataRequest(evt: DataRequest): void {
    evt.params['accountID'] = this.user.account.ID

    if (this.currentSelectedSegment == "inbound") {
      evt.params['type'] =  'transfer-in'
    } else {
      evt.params['type'] =  'transfer-out'
    }

    this._api.getOrders(evt.pageIdx, evt.pageSize, evt.sort, evt.params).subscribe((resp) => {
      this.dataRequested = resp;
    });
  }

  onRowClick(order: Order) {
    this._router.navigate(['/transfers/' + order.ID])
  }
}
