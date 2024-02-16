import { Component } from '@angular/core';
import {  USERSNAP_PROJECT_API_KEY } from 'src/app/shared/constants/usersnap.constants';
import { UsersnapService } from 'src/app/core/usersnap.service';
import { UserService } from 'src/app/core/user.service';

/**
 * There a few ways to show your widget with custom button.
 * The first thing you need to do is to make sure in the dashboard
 * configuration of your widget in the "Display" tab you have trigger "Auto Popup".
 * Then select an "API event" as an activation and type the name of this event.
 * Then you can use this event name to show your widget.
 */
@Component({
  selector: 'app-usersnap-widget',
  templateUrl: './usersnap-widget.component.html',
  providers: [UsersnapService]
})
export class UsersnapWidgetComponent {
  constructor(
    public user: UserService,
    private usersnapService: UsersnapService
  ) {
    this.initializeUsersnap()
  }

  /**
   * This method takes into account other display rules,
   * like filtering by URL path, email, logged in users and so on.
   * It means that even you call this method but widget shouldn't
   * open - it will not open
   */

  initializeUsersnap() {
    this.usersnapService.initialize({
      user: this.user
    })
  }

  // handleOpenWidgetIfAllowed() {
  //   if (this.usersnapService.usersnapApi) {
  //     this.usersnapService.usersnapApi.logEvent(USERSNAP_PROJECT_API_EVENT_NAME)
  //   }
  // }

  /**
   * This method ignores all the display rules and opens the widget
   * no matter what
   */
  handleOpenWidgetForce() {
    if (this.usersnapService.usersnapApi) {
      this.usersnapService.usersnapApi.show(USERSNAP_PROJECT_API_KEY).then((widgetApi: any) => widgetApi.open());
    }
  }
}