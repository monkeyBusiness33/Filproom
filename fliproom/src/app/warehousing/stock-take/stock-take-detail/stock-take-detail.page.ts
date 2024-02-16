import { Component, OnInit } from '@angular/core';
import {ApiService} from "../../../core/api.service";
import {ActivatedRoute, Router} from "@angular/router";
import {ModalService} from "../../../shared/modal/modal.service";
import {UserService} from "../../../core/user.service";
import {Job, JobLineItem} from "../../../shared/models/Job.model";
import {MatTableDataSource} from "@angular/material/table";
import { environment } from 'src/environments/environment';
import {filter, mergeMap} from "rxjs/operators";
import {forkJoin} from "rxjs";


@Component({
  selector: 'app-stock-take-detail',
  templateUrl: './stock-take-detail.page.html',
  styleUrls: ['./stock-take-detail.page.scss'],
})
export class StockTakeDetailPage implements OnInit {

  public isLoading = true
  public loadingJobProgress = true
  public job : Job
  public jobID
  public confirmationTot: number
  public confirmationCompleteTot: number
  public anomaliesTot: number
  public anomaliesCompleteTot: number


  public environment = environment

  public buttons = [{label: 'refresh', icon: 'refresh', id: 'refresh'},{label: 'complete', icon: 'check', id: 'complete'} ]

  constructor(
    private _api: ApiService,
    private _route: ActivatedRoute,
    private _modalCtrl: ModalService,
    private _router: Router,
    public user: UserService
  ) { }

  ngOnInit() {
   this.jobID = parseInt(this._route.snapshot.paramMap.get('jobID'))
    this.refreshData()
  }

  refreshData(){
    this.isLoading = true
    this._api.getJob(this.jobID).subscribe((job: Job) => {
        this.job = job;
        this.refreshJobProgress()
        this.isLoading = false;
      });
  }


  // Navigate to the job-line-items viewer passing the check type (anomalies or standard-check)
  // check types: 'anomaly' | 'confirm'
  //TODO: consider renaming the check types
  openJobLineItemViewer(checkType: string){
    this._router.navigate(['/warehousing/stock-take/'+this.jobID+'/job-line-items'], {queryParams: {jobID: this.job.ID, checkType: checkType}})
  }

  ionViewWillEnter() {
    this.refreshData()
  }
  onButtonClick(buttonId: string) {
    if (buttonId == 'refresh') {
      this.refreshData()
    }
    else if(buttonId == 'complete'){
      this.completeStockCheck()
    }
  }

  // Get job progress info
  refreshJobProgress(){
    this.loadingJobProgress = true
    const anomaliesTotReq = this._api.getJobLineItems(1, 1, null, {jobID: this.jobID,  action: '*'})
    const anomaliesCompleteTotReq = this._api.getJobLineItems(1, 1, null, {jobID: this.jobID, action: '*', 'status.name':['confirmed', 'deleted']})
    const confirmationTotReq = this._api.getJobLineItems(1, 1, null, {jobID: this.jobID, action: '!*'})
    const confirmationCompleteTotReq = this._api.getJobLineItems(1, 1, null, {jobID: this.jobID, action: '!*', 'status.name':'confirmed'})
    forkJoin([anomaliesTotReq,anomaliesCompleteTotReq,confirmationTotReq,confirmationCompleteTotReq]).subscribe(results=>{
      this.anomaliesTot = results[0].count
      this.anomaliesCompleteTot = results[1].count
      this.confirmationTot = results[2].count
      this.confirmationCompleteTot = results[3].count
      this.loadingJobProgress = false
    })
  }

  //Manual complete stock take
  completeStockCheck(){
      this._modalCtrl.confirm("Are you sure you would like to complete this stock-take, this action can't be undone!").pipe(filter(res=> res),
        mergeMap(res=> this._api.completeJob(this.jobID))
        ).subscribe(res => {
          this._modalCtrl.success('Job manually completed')
          this.refreshData()
      })

  }

  get anomaliesLeft(){
    return this.anomaliesTot - this.anomaliesCompleteTot
  }
  get confirmationsLeft(){
    return this.confirmationTot - this.confirmationCompleteTot
  }

  get anomaliesProgress(){
    return  this.anomaliesCompleteTot/this.anomaliesTot *100
  }
  get confirmationsProgress(){
    return this.confirmationCompleteTot/this.confirmationTot *100
  }






}
