import { Component, OnInit } from '@angular/core';
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {ModalService} from "../../../shared/modal/modal.service";
import {PluginsService} from "../../../core/plugins.service";
import {ApiService} from "../../../core/api.service";
import {Router} from "@angular/router";
import {UserService} from "../../../core/user.service";
import {ModalController} from "@ionic/angular";

@Component({
  selector: 'app-create',
  templateUrl: './create.page.html',
  styleUrls: ['./create.page.scss'],
})
export class CreatePage implements OnInit {

  constructor(
    private _modalCtrl: ModalController,
     private _modal: ModalService,
     private _plugins: PluginsService,
     private _api: ApiService,
     private router: Router,
     public user: UserService
  ) { }

  public isLoading

  public jobForm = new FormGroup({
    //TODO: change once more jobs are implemented
    type: new FormControl('stock-take'),
    warehouseID:  new FormControl(null,  Validators.required),
    accountID:new FormControl(null,  Validators.required),
    userID: new FormControl(null,  Validators.required),
    notes: new FormControl(null),
  })


  ngOnInit() {
    //patch form values
    this.jobForm.patchValue({
      accountID: this.user.account.ID,
      userID: this.user.ID,
    })
  }

  onSubmit() {
    this.jobForm.markAllAsTouched();
    if(this.jobForm.valid){
      this.isLoading = true
      const body = this.jobForm.value
      this._api.createJob(body).subscribe(job => {
        this._modal.success('Job Created')
        console.log(job)
        this.isLoading = false
        this._modalCtrl.dismiss({job},'submit')
      })
    }
  }

  onBack() {
    this._modalCtrl.dismiss()
  }




}
