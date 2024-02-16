import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler, Injectable, InjectionToken } from '@angular/core';
import * as Rollbar from 'rollbar'; // When using Typescript < 3.6.0.
import { environment } from 'src/environments/environment';
import { ModalService } from '../shared/modal/modal.service';
import { UserService } from './user.service';

export const RollbarService = new InjectionToken<Rollbar>('rollbar');
@Injectable({
  providedIn: 'root'
})
export class ErrorManagerService implements ErrorHandler  {
  private rollbar: Rollbar;

  constructor(
    private user: UserService
    ) {

      const rollbarConfig: Rollbar.Configuration = {
        accessToken: '8c295781101d474c80a30053757539fa',
        environment: `fliproom-${environment.name}`,
        captureUncaught: true,
        captureUnhandledRejections: true,
        codeVersion: environment.appVersion,
        payload: {
          version: environment.appVersion,
          sessionId: environment.sessionId,
          detectedPlatform: environment.platform
        },
        enabled: (environment.name == "production" || environment.name == "staging"),
        checkIgnore: function(isUncaught, args, payload) {
          if (payload && payload.body && payload.body['message']) {
            const message = payload.body['message'].body;
            if (message && message.includes("Connection to Indexed Database server lost")) {
              return true; // Ignore this error
            }
          }
          return false; // Don't ignore other errors
        }
      };

      this.rollbar = new Rollbar(rollbarConfig)
    }

  handleError(error: Error | HttpErrorResponse) {
    this.rollbar.configure({payload: {
      person: {
        id: this.user.ID,
        email: this.user.email,
        name: this.user.name,
        surname: this.user.surname
      },
      platformType: environment.platform
    }})

    //// Server Error
    //if (environment.production && error instanceof HttpErrorResponse && error.status != 401 && error.status != 0) {
    //  alert('Ops! We just experienced a server error. \nOur Team has been notified and will resolve the problem as soon as possible. \n\nSorry for the inconvenience!')
    //}

    // Classic Logging - display before send to rollab so that it appears in telemetry
    console.log(error)
    if (error instanceof Error) {
      console.log(error.stack)

      // Check if error message contains the specific string (case-insensitive)
      const errorMessage = error.message.toLowerCase();
      const skipMessage = "connection to indexed database server lost";
      if (errorMessage.includes(skipMessage)) {
        console.log("Skipping Rollbar logging for Indexed Database server error");
        return; // Skip sending this error to Rollbar
      }
    }

    // On production - send to rollbar
    if (this.rollbar.options.enabled && (error instanceof Error)) {
      this.rollbar.error(error);
    }


  }
}
