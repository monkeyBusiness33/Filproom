import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { delay } from 'rxjs/operators';
import { ApiService, StatusResponse } from 'src/app/core/api.service';
import { UtilService } from 'src/app/core/util.service';
import { ModalService } from 'src/app/shared/modal/modal.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
})
export class ForgotPasswordPage implements OnInit {
  public submitted: boolean = false;
  public isLoading: boolean = false;
  public forgotPasswordForm = new FormGroup({
    email: new FormControl(null, [Validators.required, Validators.email]),
  });
  constructor(
    private _util: UtilService,
    private _api: ApiService,
    private _modalCtrl: ModalService
  ) { }

  ngOnInit() {
  }

  onSubmitForm() {
    this._util.markFormGroupDirty(this.forgotPasswordForm);

    if (this.forgotPasswordForm.valid) {
      this.isLoading = true
      this._api.forgotPassword(this.forgotPasswordForm.get('email').value).pipe(
        delay(1000)
      )
      .subscribe((res: StatusResponse) => {
        this.isLoading = false;
        this.submitted = true
        this._modalCtrl.info(res.message)
      });
    }
  }
}
