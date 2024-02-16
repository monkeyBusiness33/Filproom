import { Component, OnInit } from '@angular/core';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subscription } from 'rxjs';
import { catchError, filter, map, mergeMap} from 'rxjs/operators';
import { AuthService } from 'src/app/core/auth.service';
import { UtilService } from 'src/app/core/util.service';
import { ModalService } from 'src/app/shared/modal/modal.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-signin',
  templateUrl: './signin.page.html',
  styleUrls: ['./signin.page.scss'],
})
export class SigninPage implements OnInit {
  public env = environment
  private subscriptions: Subscription[] = []
  public isLoading = false;

  public loginForm = new FormGroup({
    email: new FormControl(null, [Validators.required, Validators.email]),
    password: new FormControl(null, Validators.required),
  });

  constructor(
    private _util: UtilService,
    public authApi: AuthService,
    private _activatedRoute: ActivatedRoute,
    private _modalCtrl: ModalService,
    private _router: Router
  ) {
  }

  ngOnInit() {
    // Check for any redirect ID from the query param
    const redirectID = this._activatedRoute.snapshot.queryParamMap.get('redirectID')
    if (redirectID) {
      localStorage.setItem('marketplaceRedirectID', redirectID)
    }
    const email = this._activatedRoute.snapshot.queryParamMap.get('email')
    const password = this._activatedRoute.snapshot.queryParamMap.get('password')

    if (email && password) {
      this.loginForm.patchValue({
        email: email,
        password: password
      })
      this.onSubmitForm()
    }

    //subscribe to when the user login
    this.authApi.authStateChanges.pipe(
      map((response) => {
        return response
      }),
      filter(() => this._router.url.includes('signin')), //easy way to prevent double trigger (signin/signup) instead of unsubscribe
      mergeMap(user => {
        this.isLoading = true
        return this.authApi.getFirebaseJWToken()
      }),
      mergeMap((response) => {
        return this.authApi.signIn({
          provider: 'firebase',
          jwt: response.token,
        })
      })
    )
    .subscribe({
      next: (res) => {
        this.isLoading = false
      },
      error: (err) => {
        if (err.status == 404) {
          this._modalCtrl.warning(`Wrong email/password or account doesn't exists`);
        }
        //clear social signin otherwise would not re-trigger the authStateChanges
        this.authApi.signOut()
        this.isLoading = false
      }
    })
  }

  // Normal login using email and password
  onSubmitForm() {
    this._util.markFormGroupDirty(this.loginForm);
    if (this.loginForm.valid) {
      this.isLoading = true
      this.authApi.signIn({
        email: this.loginForm.get('email').value,
        password: this.loginForm.get('password').value
      }).subscribe({
        next: () => {
          this.isLoading = false
        },
        error: (err) => {
          if (err.status == 404) {
            this._modalCtrl.warning(`Wrong email/password or account doesn't exists`);
          }
          this.isLoading = false
        }
      })
    }
  }
}
