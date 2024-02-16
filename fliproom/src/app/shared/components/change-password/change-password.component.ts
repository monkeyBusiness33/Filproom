import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { ModalService } from 'src/app/shared/modal/modal.service';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { AuthService } from 'src/app/core/auth.service';
import { forkJoin } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

@Component({
  selector: 'app-change-password',
  templateUrl: './change-password.component.html',
  styleUrls: ['./change-password.component.scss'],
})

export class ChangePasswordComponent implements OnInit {

  public isLoading = false

  public generalForm = new FormGroup({
    password: new FormControl(null),
    confirmPassword: new FormControl(null),
  }, [GeneralFormValidator])

  public invoicingForm = new FormGroup({
    vatNumber: new FormControl(null, Validators.required),
  })

  constructor(
    private _modalCtrl: ModalService,
    private _modal :ModalController,
    private _api: ApiService,
    private _auth: AuthService,
    public user: UserService,
  ) { }

  ngOnInit() {
    this.generalForm.patchValue({
      password: this.user.password,
      confirmPassword: this.user.password,
    })
  }

  onCancel() {
    this._modal.dismiss();
  }
  onSaveChanges() {
    this.isLoading = true
    const userUpdates = {}

    if (!this.generalForm.pristine) {
      if (!this.generalForm.get('confirmPassword').pristine && this.generalForm.get('confirmPassword').errors.matchingPasswords) {
        userUpdates['password'] = this.generalForm.value.password
      }
    }
    const updatesQueries = []
    if (Object.keys(userUpdates).length != 0) {
      updatesQueries.push(this._api.updateUser(this.user.ID, userUpdates))
    }

    forkJoin(updatesQueries).pipe(
      mergeMap(() => this._api.getAccountInfo())
    ).subscribe((user) => {
      this.ngOnInit()
      this.isLoading = false

      if (userUpdates['password'] != undefined) {
        this._modalCtrl.alert('Password Changed. Please Sign In again').subscribe(() => this._auth.signOut())
        this._modal.dismiss();
      }

      this.generalForm.markAsPristine()
      this.invoicingForm.markAsPristine()

      this._modalCtrl.success('Settings Updated')
    })

  }

}

const GeneralFormValidator: ValidatorFn = (fg: FormGroup) => {
  fg.get('confirmPassword').setErrors({ 'matchingPasswords': fg.get('password').value == fg.get('confirmPassword').value })
  return null
}