import {Component, OnInit, ViewChild} from '@angular/core';
import { environment } from 'src/environments/environment';
import { FliproomListComponent } from 'src/app/shared/fliproom-list/fliproom-list.component';
import {Router} from "@angular/router";
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { Job } from 'src/app/shared/models/Job.model';
import {
  DataRequest,
  TableConfiguration,
  TableWrapperComponent
} from 'src/app/shared/table-wrapper/table-wrapper.component';
import {ModalService} from "../../shared/modal/modal.service";
import {CreatePage} from "./create/create.page";


@Component({
  selector: 'app-stock-take',
  templateUrl: './stock-take.page.html',
  styleUrls: ['./stock-take.page.scss'],
})
export class StockTakePage implements OnInit {

  @ViewChild('tableWrapper') tableWrapper: TableWrapperComponent;
  @ViewChild('fliproomList') fliproomList: FliproomListComponent;

  public jobType: string = "stock-take"
  public statusesTabsList: string[] = ['created', 'processing', 'completed']
  public currentSelectedSegment: string = 'created'

  public environment = environment;

  public tableConfigs: TableConfiguration = new TableConfiguration({
    columnsConfig: [],
    tableKey: 'stock-takes',
    showColumnsSelection: true,
    showAdvancedFilter: true,
    rowHoverable: true,
    emptyTablePlaceholder: 'No Jobs Available',
    disableDownload: true,
    dataSourceFnName: 'getJobs' // pass this to allow table download
  })

  public dataRequested;
  public isLoading: boolean =  true;
  public buttons = [{label: 'create', icon: 'add', id: 'create'}]

  constructor(
    private _router: Router,
    public user: UserService,
    public _api: ApiService,
    private _modalCtrl: ModalService,

  ) {
    this.tableConfigs.columnsConfig = [
      {reference: 'ID',                        displayedName: 'ID',            dataType: 'string'},
      {reference: 'user.name',                 displayedName: 'Created By',    dataType: 'string'},
      {reference: 'type.name',               displayedName: 'Type',        dataType: 'string'},
      {reference: 'warehouseID',                 displayedName: 'Warehouse ID',    dataType: 'string'},
      {reference: 'warehouse.name',                 displayedName: 'Warehouse',    dataType: 'string'},
      {reference: 'quantity',                  displayedName: 'Quantity',      dataType: 'number'},
      {reference: 'createdAt',                 displayedName: 'Created At',    dataType: 'date'},
      {reference: 'startedAt',                 displayedName: 'Started At',    dataType: 'date'},
      {reference: 'completedAt',                 displayedName: 'Completed At',    dataType: 'date'},
      {reference: 'status.name',               displayedName: 'Status',        dataType: 'string'},
    ]
  }

  ngOnInit() {
  }

  ionViewWillEnter(){
    this.onRefresh()
  }


  onRefresh() {
    this.tableWrapper ? this.tableWrapper.refresh() : null
    this.fliproomList ? this.fliproomList.refresh() : null
  }


  onSegmentChanged(evt){
    this.currentSelectedSegment = evt.detail.value
    this.onRefresh()
  }


  onDataRequest(evt: DataRequest): void {
    evt.params['accountIDs'] = this.user.account.ID
    evt.params['type']= this.jobType
    //Filter order status based on current tab selected
    evt.params['status'] = this.currentSelectedSegment
    this._api.getJobs(evt.pageIdx, evt.pageSize, evt.sort, evt.params).subscribe((resp) => {
      this.isLoading = false
      this.dataRequested = resp;
    });
  }

  onButtonClick(buttonId: string) {
    if (buttonId == 'create') {
      this.onCreateStockTakeJob()
    }
  }

  onCreateStockTakeJob() {
    this._modalCtrl.open(CreatePage).subscribe((res)=> {
      this.onRefresh()
      if (res){
        this._router.navigate(['/warehousing/stock-take/'+ res.job.ID])
      }
    })
  }

  onRowClick(job: Job) {
    this._router.navigate(['/warehousing/stock-take/' + job.ID])
  }
}
