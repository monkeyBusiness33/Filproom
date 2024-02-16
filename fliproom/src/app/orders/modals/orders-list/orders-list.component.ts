import { Component, Inject, Input, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { Order } from 'src/app/shared/models/Order.model';

@Component({
  selector: 'app-orders-list',
  templateUrl: './orders-list.component.html',
  styleUrls: ['./orders-list.component.scss'],
})
export class OrdersListComponent implements OnInit {
  @Input() data: Order[];
  public ordersList: Order[] = []

  constructor(
    private _modalCtrl: ModalController,
    private _router: Router
  ) { }

  ngOnInit(): void {
    this.ordersList = this.data
  }

  onCancel() {
    this._modalCtrl.dismiss();
  }

  onOrderSelected(orderID: number) {
    this._modalCtrl.dismiss()
    this._router.navigate([`/orders/${orderID}`]);
  }
}
