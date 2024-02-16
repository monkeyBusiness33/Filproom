import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { FliproomListComponent } from 'src/app/shared/fliproom-list/fliproom-list.component';
import { IModalResponse, ModalService } from 'src/app/shared/modal/modal.service';
import { Fulfillment } from 'src/app/shared/models/Fulfillment.model';
import { Warehouse } from 'src/app/shared/models/Warehouse.model';
import { DataRequest } from 'src/app/shared/table-wrapper/table-wrapper.component';

@Component({
  selector: 'app-outbound',
  templateUrl: './outbound.page.html',
  styleUrls: ['./outbound.page.scss'],
})
export class OutboundPage implements OnInit {
  public selectedWarehouse: Warehouse;

  @ViewChild('fliproomList') fliproomList: FliproomListComponent;
  public dataRequested

  constructor(
    public user: UserService,
    private _api: ApiService,
    private _router: Router,
    private _modalCtrl: ModalService
  ) { }

  ngOnInit() {

    if (localStorage.getItem('selected-warehouseID')) {
      this.selectedWarehouse = this.user.account.warehouses.find((wh: Warehouse) => wh.ID.toString() == localStorage.getItem('selected-warehouseID'))
    } else {
      this.selectedWarehouse = this.user.account.warehouses[0]
      localStorage.setItem('selected-warehouseID', this.selectedWarehouse.ID.toString())
    }
  }

  ngAfterViewInit() {
    this.onRefresh()
  }


  onRefresh() {
    this.fliproomList ? this.fliproomList.refresh() : null
  }

  onDataRequest(evt: DataRequest): void {
    let params = {
      originAddressID: `${this.selectedWarehouse.addressID}`,
      status: 'created',
      type: 'outbound,transfer-out'
    }

    if (evt.params.search) {
      params['search'] = evt.params.search
    }

    this._api.getFulfillments(evt.pageIdx, evt.pageSize, 'createdAt:desc', params).subscribe((resp) => {
      this.dataRequested = resp;
    });
  }

  onItemSelected(fulfillment: Fulfillment) {
    this._router.navigate([`/orders/${fulfillment.outboundOrder.ID}/fulfillment/${fulfillment.ID}`])
  }

  onWarehouseSelected(warehouse: Warehouse) {
    if (this.selectedWarehouse && this.selectedWarehouse.ID == warehouse.ID) {
      this._modalCtrl.info(`Warehouse already selected`)
      return
    }

    this.selectedWarehouse = warehouse
    localStorage.setItem('selected-warehouseID', warehouse.ID.toString())
    this.onRefresh()
  }

  onWarehouseSelection() {
    const warehouses = []
    this.user.account.warehouses.map((wh: Warehouse) => warehouses.push({
      title: wh.name,
      key: wh.ID
    }))
    this._modalCtrl.actionSheet('Warehouses', warehouses).pipe(
      filter((resp: IModalResponse) => resp.role == "submit"),
      map((resp: IModalResponse) => resp.data)
    ).subscribe((warehouseID: number) => {
      this.onWarehouseSelected(this.user.account.warehouses.find((wh) => wh.ID == warehouseID))
    })
  }

  getProgress(fulfillment: Fulfillment): number {
    return (fulfillment.orderLineItems.filter(oli => oli.dispatchedAt != null).length / fulfillment.orderLineItems.length)

  }

}
