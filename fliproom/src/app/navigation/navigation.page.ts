import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { MenuController } from '@ionic/angular';
import { environment } from 'src/environments/environment';
import { AuthService } from '../core/auth.service';
import { UserService } from '../core/user.service';
import { ModalService } from '../shared/modal/modal.service';
import { WelcomeScreenComponent } from '../shared/components/welcome-screen/welcome-screen.component';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.page.html',
  styleUrls: ['./navigation.page.scss']
})
export class NavigationPage implements OnInit {
  public env = environment
  public menuType: string = environment.screenType == 'mobile' ? 'overlay' : 'push'
  public selectedOption: string;

  public navigationRoutes = [
    {
      id: 'dashboard',
      path: '/dashboard'
    },
    {
      id: 'listings',
      path: '/listings'
    },
    {
      id: 'marketplace',
      path: '/marketplace'
    },
    {
      id: 'inventory',
      path: '/inventory'
    },
    {
      id: 'inbound',
      path: '/orders?type=inbound'
    },
    {
      id: 'outbound',
      path: '/orders?type=outbound'
    },
    {
      id: 'transfers',
      path: '/transfers'
    },
    {
      id: 'pos',
      path: '/orders/create/checkout'
    },
    {
      id: 'payments',
      path: '/payments'
    },
    {
      id: 'warehousing',
      path: '/warehousing'
    },
    {
      id: 'search',
      path: '/warehousing/item-search'
    },
    {
      id: 'reports',
      path: '/reports'
    },
    {
      id: 'products',
      path: '/products'
    },
    {
      id: 'integrations',
      path: '/integrations'
    },
    {
      id: 'settings',
      path: '/settings'
    }
  ]
  constructor (
    private authApi: AuthService,
    private menu: MenuController,
    private router: Router,
    public user: UserService,
    private _route: ActivatedRoute,
    private _modalCtrl: ModalService
  ) { }

  ngOnInit() {
    this.router.events.subscribe((val) => {
      // see also
      if (val instanceof NavigationEnd) {
        this.navigationRoutes.map(navigationRoute => {
          if (val.url.includes(navigationRoute.path)) {
            this.selectedOption = navigationRoute.id
          }
        })
      }
    });

    const url = `${location.host}${location.pathname}`
    // if user accessign paltform wtih already a destination - do not redirect to default
    if (url.split("/")[1]) {
      return
    }


    // if first sessiion - show welcome screen
    console.log(this._route.snapshot.queryParams)
    if (this._route.snapshot.queryParams.firstSession == 'true') {
      this._modalCtrl.open(WelcomeScreenComponent, null, {cssClass: 'full-screen'}).subscribe(() => {})
      return
    }

    //default behaviour
    this.router.navigate(['/dashboard'],{ queryParams: this._route.snapshot.queryParams})

  }

  onButtonClick(id: string) {
    this.selectedOption = id
    this.menu.close()
  }
}
