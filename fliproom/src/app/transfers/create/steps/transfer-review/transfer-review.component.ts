import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Item } from 'src/app/shared/models/Item.model';

@Component({
  selector: 'app-transfer-review',
  templateUrl: './transfer-review.component.html',
  styleUrls: ['./transfer-review.component.scss'],
})
export class TransferReviewComponent implements OnInit {
  @Input()  transferHeader: any
  @Input()  transferDetailsList: Item[]
  @Output() onBack = new EventEmitter()
  @Output() onNext = new EventEmitter()

  constructor() { }

  ngOnInit() {}

  onBackButtonClicked() {
    this.onBack.emit()
  }

  onSubmit() {
    this.onNext.emit()
  }

}
