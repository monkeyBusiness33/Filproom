import { Injectable} from "@angular/core";
import { NavigationEnd, Router } from "@angular/router";
import { filter } from "rxjs/operators";
import { environment } from "src/environments/environment";
import { UserService } from "./user.service";
import Hotjar from '@hotjar/browser';
import { FirebaseAnalytics } from '@capacitor-firebase/analytics';
import { HttpClient } from "@angular/common/http";
import { ApiService } from "./api.service";

//import { Plugins } from "@capacitor/core";
//const { FirebaseAnalytics } = Plugins;

@Injectable({
    providedIn: 'root'
})
export class AnalyticsService {
    constructor(
        private _router: Router,
        private user: UserService,
        private _http: HttpClient,
        private _api: ApiService
    ) {
    }

    async startTracker() {
        // initialize for the web
        if (!environment.isCordovaAvailable) {
            // setup hotjar
            console.log("[DEBUG] analytics - start hotjar")
            Hotjar.init(3528849, 6);
            Hotjar.event('started');
        }

        // setup page_view event for SPA - Each time the application detects a NavigationEnd event from the router, a page view should be logged to Google Analytics
        this._router.events.pipe(
            filter((e) => e instanceof NavigationEnd)
        ).subscribe((e: NavigationEnd) => {
            const urlQuery = new URL(window.location.href);
            let params = {
                "page_location": urlQuery.href
            }

            params = this.extractSource(params)
            this.trackEvent('page_view', params)
        })

        await FirebaseAnalytics.setEnabled({
            enabled: true,
        });
    }

    hotjarStateChanged(pageUrl: string) {
        Hotjar.stateChange(pageUrl);
    }

    extractSource(params) {
        const urlQuery = new URL(window.location.href);
        for (var queryKey of ['source', 'medium', 'campaign']) {
            if (urlQuery.searchParams.get(`utm_${queryKey}`)) {
                params[queryKey] = urlQuery.searchParams.get(`utm_${queryKey}`)
            }
        }

        return params
    }


    setUserId(userId) {
        FirebaseAnalytics.setUserId({
            userId: `${userId}`,
        });
    }

    trackEvent(eventName: string, data = {}) {
        //Listen for signup event. If it happens, set the isSignupSession to true to track what the user does on the first session
        if (eventName == 'sign_up') {
            environment.signupSession = true
        }

        data['fliproom_session_id'] = environment.sessionId
        if (this.user.ID) {
            data['consignor'] = this.user.account.isConsignor
            data['userId'] = this.user.ID //DEPRECATED
            data['user_id'] = this.user.ID //CORRECT WAY TO TRACU USER ID ON ANALYTICS FOR FIRST-PARTY TRACKING
            data['user_email'] = this.user.email
            data['app_version'] = environment.appVersion
            data['daysSinceSignup'] = this.user.daysSinceSignup
            data['signupSession'] = environment.signupSession
        }

        //console.log(`Logging event - ${eventName}`, data)
        if (environment.name == "local" || environment.name == "staging") {
            console.log("[DEBUG] analytics - trackEvent")
            console.log({
                name: eventName,
                params: data,
            })
            return
        }

        // TODO: remove once we figure out why the fuck the parameter topic doesn't show up on google analytics
        if (data['feedbackId'] == "user-satisfaction") {
            console.log("sending")
            this._api.trackEvent({
                name: eventName,
                params: data,
            }).subscribe((res) => {})
        }

        FirebaseAnalytics.logEvent({
            name: eventName,
            params: data,
        });
    }
}
