import { Component, OnInit } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, filter, map, mergeMap} from 'rxjs/operators';
import { AnalyticsService } from 'src/app/core/analytics.service';
import { AuthService } from 'src/app/core/auth.service';
import { UtilService } from 'src/app/core/util.service';
import { ModalService } from 'src/app/shared/modal/modal.service';
import { environment } from 'src/environments/environment';
import { App } from '@capacitor/app';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.page.html',
  styleUrls: ['./signup.page.scss'],
})
export class SignupPage implements OnInit {
  public env = environment
  public isLoading = false;

  public signupForm = new FormGroup({
    name: new FormControl(null, [ Validators.required]),
    surname: new FormControl(null, [ Validators.required]),
    email: new FormControl(null, [Validators.email, Validators.required]),
    existingEmail: new FormControl(false, [ValidateEmail]),
    password: new FormControl(null, [Validators.required]),
    confirmPassword: new FormControl(null, [Validators.required]),
    consignInvite: new FormControl(null),
    inviteToken: new FormControl((new URL(window.location.href)).searchParams.get(`invite`) || null),
  }, [FormValidator])

  constructor(
    private _util: UtilService,
    public authApi: AuthService,
    private _modalCtrl: ModalService,
    private _analytics: AnalyticsService,
    private _route: ActivatedRoute,
    private _router: Router
  ) { }

  ngOnInit() {
    const urlQuery = new URL(window.location.href);
    if (urlQuery.searchParams.get(`consignInvite`)) {
      this.signupForm.patchValue({
        consignInvite: urlQuery.searchParams.get(`consignInvite`)
      })
    }
    else if (environment.platform != 'web') {
      //temporary solution. enable consignment for edit ldn when user signup on the mobile app
      App.getInfo().then((info) => {
        if (info.id == 'com.editldn.wiredhub') {
          this.signupForm.patchValue({
            consignInvite: 'edit-ldn'
          })
        }
      })
    }


    let authProvider;
    let jwtString;
    //subscribe to when the user signsup
    this.authApi.authStateChanges.pipe(
      map((response) => {
        return response
      }),
      filter(() => this._router.url.includes('signup')), //easy way to prevent double trigger (signin/signup) instead of unsubscribe
      mergeMap((resp) => {
        authProvider = resp.authProvider
        this.isLoading = true
        return this.authApi.getFirebaseJWToken()
      }),
      mergeMap((response) => {
        jwtString = response.token
        return this.authApi.signUp({
          provider: 'firebase',
          jwt: response.token,
          consignInvite: this.signupForm.value.consignInvite,
        })
      }),
      mergeMap(user => {
        let params = {
          type: authProvider,
          user_email: user.email,
          userId: user.ID,
          inviteToken: this.signupForm.value.inviteToken
        }

        params = this._analytics.extractSource(params)
        this._analytics.trackEvent('sign_up', params)

        return this.authApi.signIn({
          jwt: jwtString
        }, true)
      })
    )
    .subscribe({
      next: (res) => {},
      error: (err) => {
        if (err.status == 409) {
          this._modalCtrl.warning(`Email already in use. Please Signin`);
        }
        //clear social signin otherwise would not re-trigger the authStateChange
        this.authApi.signOut()
        this.isLoading = false
      }
    })
  }

  // Registration without social login
  onSubmit(evt) {
    this._util.markFormGroupDirty(this.signupForm);
    if (this.signupForm.valid) {
      this.isLoading = true
      this.authApi.signUp({
        email: this.signupForm.value.email,
        password: this.signupForm.value.password,
        name: this.signupForm.value.name,
        surname: this.signupForm.value.surname,
        consignInvite: this.signupForm.value.consignInvite
      }).pipe(
        mergeMap(user => {
          let params = {
            type: 'form',
            user_email: this.signupForm.value.email,
            userId: user.ID,
            inviteToken: this.signupForm.value.inviteToken
          }

          params = this._analytics.extractSource(params)
          this._analytics.trackEvent('sign_up', params)

          return this.authApi.signIn({
            email: this.signupForm.value.email,
            password: this.signupForm.value.password
          }, true)
        })
      )
      .subscribe({
        next: (resp) => {},
        error: (err) => {
          if (err.status == 409) {
            this._modalCtrl.warning(`Email already in use. Please Signin`);
            this.isLoading = false
          }
        }
      })
    }
  }
}

function ValidateEmail(control: AbstractControl): { [key: string]: any } | null {
  if (!!control.value) {
    return { 'invalidEmail': true };
  }
  return null;
}

const FormValidator: ValidatorFn = (fg: FormGroup) => {
  let valid = true
  const errors = {
    existingEmail: false,
    matchingPasswords: true
  }
  if (!!fg.get('existingEmail').value) {
    errors.existingEmail = true;
    fg.get('email').setErrors({ 'existingEmail': true })
    valid = false
  }
  if (fg.get('password').value != fg.get('confirmPassword').value) {
    errors.matchingPasswords = false;
    fg.get('confirmPassword').setErrors({ 'matchingPasswords': false })
    valid = false
  }
  return valid ? null : errors
}
