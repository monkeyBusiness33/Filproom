import { Component, ElementRef, Inject, Input, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { ModalController } from '@ionic/angular';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';

export interface IProgressComponent {
  title: string;
  subtitle?: string;
  counter?: boolean;
  status: string; // Loading | Completed | Error
  cancel?: string;
  confirm?: string;
}

@Component({
  selector: 'app-progress',
  templateUrl: './progress.component.html',
  styleUrls: ['./progress.component.scss'],
  standalone: true,
  imports: [MatProgressBarModule, MatButtonModule, MatDialogModule, CommonModule],
})
export class ProgressComponent implements OnInit {
  @Input() data: IProgressComponent;
  seconds = 0;
  timeout = 120000;

  constructor(
    private _modalCtrl: ModalController,
  ) { }

  ngOnInit() {
    if(this.data.counter){
      this.counter();
    }
  }

  onConfirm() {
    this._modalCtrl.dismiss('confirm', 'submit');
  }

  onCancel(): void {
    this._modalCtrl.dismiss(null);
  }

  counter() {
    const intervalId = setInterval(() => {
      this.seconds++;
    }, 1000);

    setTimeout(() => {
      clearInterval(intervalId);
    }, this.timeout);

  }

}
