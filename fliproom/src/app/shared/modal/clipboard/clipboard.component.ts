import {Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';

export interface IClipboardComponent {
  title: string;
  subtitle?: string;
  buttonText?: string;
  value: string;
  valueLabel: string;
}

@Component({
  selector: 'app-clipboard',
  templateUrl: './clipboard.component.html',
  styleUrls: ['./clipboard.component.scss'],
})
export class ClipboardComponent implements OnInit {
  @Input() data: IClipboardComponent;

  constructor(private _modalCtrl: ModalController) { }

  ngOnInit() { }

  onBack() {
    this._modalCtrl.dismiss();
  }

  onCopy() {
    navigator.clipboard.writeText(this.data.value);
    this._modalCtrl.dismiss(true, 'submit');
  }

}
