import {Component, Input, OnInit} from '@angular/core';
import {Order} from "../../models/Order.model";


export interface Step {
  value: string,
  label: string,
  subLabel: string,
  additionalSubLabel: string,
  stepStatus: string, // 'completed' | 'processing' | 'pending'
  color: string, // 'success' | 'warning' | 'danger'
}

@Component({
  selector: 'app-steps',
  templateUrl: './steps.component.html',
  styleUrls: ['./steps.component.scss'],
})


export class StepsComponent implements OnInit {

  @Input() steps: Step[];

  constructor() { }

  ngOnInit() {
  }

  /**
   * Styling getters
   */
  getStepTextClass(step: Step) {
    if (step.stepStatus == 'completed') return `text-success-500`;
    if (step.stepStatus == 'processing') return `text-warning-500`;
    if (step.stepStatus == 'pending') return `text-grey-500`;
    return ``;
  }

  getStepBodyClass(step: Step) {
    if (step.stepStatus == 'completed') return `border-success-500`;
    if (step.stepStatus == 'processing') return `border-warning-500`;
    if (step.stepStatus == 'pending') return `border-grey-500`;
    return ``;
  }

}
