import {Component, OnInit, ViewChild} from '@angular/core';
import {Router} from "@angular/router";
import {UserService} from "../core/user.service";

@Component({
  selector: 'app-warehousing',
  templateUrl: './warehousing.page.html',
  styleUrls: ['./warehousing.page.scss'],
})
export class WarehousingPage implements OnInit {


  constructor(
    private _router: Router,
    public user: UserService,
  ) { }

  ngOnInit() {
  }

  onNavigate(destination: string){
    switch (destination) {
      case 'stock-take':
        this._router.navigate(['/warehousing/stock-take'])
        break;
      case 'inbound':
        this._router.navigate(['/warehousing/inbound'])
        break;
      case 'outbound':
        this._router.navigate(['/warehousing/outbound'])
        break;
      case 'item-search':
        this._router.navigate(['/warehousing/item-search'])
        break;
    }
  }



}
