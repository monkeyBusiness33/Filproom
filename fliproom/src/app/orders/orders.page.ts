import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { Order } from 'src/app/shared/models/Order.model';
import { DataRequest, TableConfiguration, TableWrapperComponent } from 'src/app/shared/table-wrapper/table-wrapper.component';
import { environment } from 'src/environments/environment';
import { FliproomListComponent } from '../shared/fliproom-list/fliproom-list.component';
import { ModalService } from '../shared/modal/modal.service';

@Component({
  selector: 'app-orders',
  templateUrl: './orders.page.html',
  styleUrls: ['./orders.page.scss'],
})
export class OrdersPage implements OnInit {
  @ViewChild('tableWrapper') tableWrapper: TableWrapperComponent;
  @ViewChild('fliproomList') fliproomList: FliproomListComponent;

  public environment = environment

  public tableConfigs: TableConfiguration = new TableConfiguration({
    columnsConfig: [
    ],
    tableKey: 'orders',
    showColumnsSelection: true,
    showAdvancedFilter: true,
    rowHoverable: true,
    emptyTablePlaceholder: 'No Orders Available',
    dataSourceFnName: 'getOrders' // pass this to allow table download
  })

  public orderType: string = "inbound"
  public statusesTabsList: string[] = []
  public currentSelectedSegment: string = 'all'

  public dataRequested;

  constructor(
    public user: UserService,
    public _api: ApiService,
    private _router: Router,
    private _route: ActivatedRoute,
    private _modalCtrl: ModalService
  ) {
    this._route.queryParams.subscribe(p => {
      // if missing order type to disaply - redirect to inbound
      if (!p.type) {
        this._router.navigate(['orders'], {queryParams: {type: 'outbound', status: 'all'}})
        return
      }

      this.currentSelectedSegment = p.status || 'all'
      this.orderType = p.type

      if (this.orderType == "inbound") {
        //TODO: need to know sourcing account-location and destination account-location
        this.tableConfigs.columnsConfig = [
          {reference: 'createdAt',                 displayedName: 'Created At',    dataType: 'date'},
          {reference: 'ID',                        displayedName: 'ID',            dataType: 'string'},
          {reference: 'user.name',                 displayedName: 'Created By',    dataType: 'string'},
          {reference: 'reference1',                displayedName: 'Reference',     dataType: 'string'},
          {reference: 'quantity',                  displayedName: 'Quantity',      dataType: 'number'},
          {reference: 'consignor.fullName',            displayedName: 'Origin',        dataType: 'string'},
          {reference: 'consignee.fullName',            displayedName: 'Destination',   dataType: 'string'},
          {reference: 'status.name',               displayedName: 'Status',        dataType: 'string'},
          {reference: 'tags',                      displayedName: 'Tags',          dataType: 'string'},
        ]
        this.tableConfigs.tableKey = "inbound"
        this.statusesTabsList = ['all', 'created', 'fulfilling', 'dispatched', 'delivered']
      } else {
        this.tableConfigs.columnsConfig = [
          {reference: 'createdAt',              displayedName: 'Created At',    dataType: 'date'},
          {reference: 'ID',                     displayedName: 'ID',            dataType: 'string'},
          {reference: 'user.name',              displayedName: 'Created By',    dataType: 'string'},
          {reference: 'saleChannel.title',       displayedName: 'Sale Channel',  dataType: 'string'},
          {reference: 'reference1',             displayedName: 'Reference',     dataType: 'string'},
          {reference: 'consignor.fullName',         displayedName: 'Origin',        dataType: 'string'},
          {reference: 'consignee.fullName',         displayedName: 'Destination',   dataType: 'string'},
          {reference: 'consignee.address',      displayedName: 'Destination Address',       dataType: 'string'},
          {reference: 'quantity',               displayedName: 'Quantity',      dataType: 'number'},
          {reference: 'totalAmount',            displayedName: 'Amount',        dataType: 'number'},
          {reference: 'status.name',            displayedName: 'Status',        dataType: 'string'},
          {reference: 'tags',                      displayedName: 'Tags',          dataType: 'string'},
        ]
        this.tableConfigs.tableKey = "outbound"
        this.statusesTabsList = ['all', 'pending', 'fulfill', 'fulfilling', 'dispatched', 'delivered', 'cancelled']
      }

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
    this._modalCtrl.help('orders').subscribe(() => {})
  }

  /**
   * event = index of mat-tab
   * 0 : outbound
   * 1: inbound
   * changes the query parameter of the url and refresh table
   * to reflect changes
   * @param event
   */
   onSegmentChanged(evt){
    this.currentSelectedSegment = evt.detail.value
    this._router.navigate(['/orders'], {queryParams: {type: this.orderType, status: this.currentSelectedSegment}})
    this.onRefresh()
  }

  onDataRequest(evt: DataRequest): void {
    evt.params['accountIDs'] = this.user.account.ID

    const orderType = this.orderType ? this.orderType : this._route.snapshot.queryParamMap.get('type');
    if (orderType == "inbound") {
      evt.params['type'] =  evt.params['type.name'] ? evt.params['type.name'] : 'inbound'
    } else {
      evt.params['type'] =  evt.params['type.name']? evt.params['type.name'] : 'outbound'
    }

    //Filter order status based on current tab selected
    const statusName = this.currentSelectedSegment

    if (statusName == "pending") {
      evt.params['status'] = `pending,partially-confirmed`
    } else if (statusName == "cancelled") {
      evt.params['status'] = `rejected,partially-rejected,refunded,partially-refunded,deleted`
    } else if (statusName != "all") {
      evt.params['status'] = `${statusName},partially-${statusName}`
    }

    this._api.getOrders(evt.pageIdx, evt.pageSize, evt.sort, evt.params).subscribe((resp) => {
      this.dataRequested = resp;
    });
  }

  onRowClick(order: Order) {
    this._router.navigate(['/orders/' + order.ID])
  }
}
