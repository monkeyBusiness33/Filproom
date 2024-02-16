import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import {FormArray, FormControl, FormGroup, Validators} from '@angular/forms';
import { ModalService } from '../modal.service';
import { ModalController } from '@ionic/angular';
import { AnalyticsService } from 'src/app/core/analytics.service';
import {Subscription} from "rxjs";

export interface IFeedbackInterfaceComponent {
  title: string,
  subTitle?: string,
  id: string
  reasons?: string[],
  optionCards?: OptionCard[],
  mode?: string // 'feedback' || 'poll'  || 'feedback-bulk' || 'option-cards'
  cssClass?: string
  topics?: Topic[] //'feedback-bulk'
  submitOnOptionClick?: boolean, // 'option-cards'
  hideSubmit?: boolean ,
  showInterestDismissal?: boolean
  ionContentAlt?: boolean

}

export interface Topic {
  title: string,
  id: string,
}

export interface OptionCard {
  title: string,
  id: string,
  description: string,
  list: string[],
  suffix: string,
}


@Component({
  selector: 'app-feedback-interface',
  templateUrl: './feedback-interface.component.html',
  styleUrls: ['./feedback-interface.component.scss'],
})
export class FeedbackInterfaceComponent implements OnInit {

  private onCloseSubscription: Subscription;

  @Input() data: IFeedbackInterfaceComponent;
  public rating: number;
  public disabled: boolean;
  public mode: string = 'feedback'
  Math: any;
  parseFloat: any;
  iconsArray: number[] = [];
  @Output()
  ratingChanged: EventEmitter<number> = new EventEmitter<number>();
  @Input()
  readonly: string = 'false';
  @Input()
  activeColor: string = '#ffc200';
  @Input()
  defaultColor: string = '#aaaaaa';
  @Input()
  activeIcon: string = 'star';
  @Input()
  defaultIcon: string = 'star-outline';
  @Input()
  halfIcon: string = 'star-half';
  @Input()
  halfStar: string = 'false';
  @Input() maxRating: number = 5;
  @Input() fontSize: string = '36px';

  public displayReasons: boolean = false; // set to true once the user selectes a rating. Used to display the reasons
  public feedbackForm = new FormGroup({
    feedbackId: new FormControl(null),
    rating: new FormControl(null),
    option: new FormControl(null),
    extraFeedback: new FormControl(null), // TODO: integrate into reasons
    topics : new FormArray([],c => {
      const atleastOneReviewed = (c as FormArray).controls.find(x => x.value.rating);
      return atleastOneReviewed ? {} : { noOptionSelected: true };
    }),
    reasons: new FormArray([],c => {
      const atleastOneChecked = (c as FormArray).controls.find(x => x.value === true);
      return atleastOneChecked ? {} : { noOptionSelected: true };
    })
  })



  constructor(
    private _modalService: ModalService,
    private modalController: ModalController,
    private analytics: AnalyticsService,
    private _modalCtrl: ModalController,
  ) {
    this.Math = Math;
    this.parseFloat = parseFloat;
  }

  ngOnInit(): void {
    for (let i = 0; i < this.maxRating; i++) {
      this.iconsArray.push(i);
    }


    this.feedbackForm.patchValue({
      feedbackId: this.data.id
    })


    this.mode = this.data.mode
    //load topics
    if(this.mode == 'feedback-bulk'){
      //this.fontSize = '24px'
      //disable reasons
      this.feedbackForm.get('reasons').disable()
      //disable rating
      this.feedbackForm.get('rating').disable()
      //load topics
      this.data.topics.map((topic: Topic) => (this.feedbackForm.get('topics') as FormArray).push(new FormGroup({
        id: new FormControl(topic.id),
        title: new FormControl(topic.title),
        rating: new FormControl(null),
        extraFeedback: new FormControl(null),
        iconsArray: new FormControl(this.iconsArray)
       // id: topic.id ,title: topic.title, rating: null, review: '',iconsArray: this.iconsArray
      })))
    }
    else if(this.mode == 'feedback' ){
      this.data.reasons.map((reason: string) => (this.feedbackForm.get('reasons') as FormArray).push(new FormControl(false)))
    }

    else if (this.mode === "poll") {
      this.data.reasons.map((reason: string) => (this.feedbackForm.get('reasons') as FormArray).push(new FormControl(false)))
      this.displayReasons = true
    }
    else if (this.mode === "option-cards") {
      this.feedbackForm.get('reasons').disable()
      this.feedbackForm.get('topics').disable()
      this.feedbackForm.get('rating').disable()
      //make option field required
      this.feedbackForm.get('option').setValidators(Validators.required)
    }

    //subscribe to when modal is closed
    this.onCloseSubscription = this._modalService.onClose.subscribe(() => {
      const data = {
        feedbackId: this.feedbackForm.get('feedbackId').value,
        rating: this.feedbackForm.get('rating').value,
      }

      if(this.data.reasons){
        // need to send reasons as its own keys to GA because GA doesnt support arrays
        this.data.reasons.filter((reason, idx) => this.feedbackForm.get('reasons').value[idx]).map((reason, idx) => {
          data[`reason${idx + 1}`] = reason
        })
      }


      if (this.feedbackForm.get('reasons').enabled &&( data.rating !== null || !this.feedbackForm.get('reasons').errors.noOptionSelected)) {
        let i = 0;
        for (let reason of this.feedbackForm.get('reasons').value) {
          if (reason){
            let reasonValue = this.data.reasons[i]
            if(reasonValue == 'Other'){
              reasonValue = this.feedbackForm.get('extraFeedback').value
            }
            this.analytics.trackEvent('feedback_submitted', {
              feedbackId: this.data.id,
              reason1: reasonValue
            })
          }

          i ++
        }
        this._modalService.success('Your opinion matters to us, thank you!')
      }
      //bulk feedback

      else if(this.feedbackForm.get('topics').enabled && !this.feedbackForm.get('topics').errors){
        this.data.topics.filter((topic, idx) => this.feedbackForm.get('topics').value[idx].rating).map((topic, idx) => {
          this.analytics.trackEvent('feedback_submitted', {
            feedbackId:  this.data.id,
            topic: this.feedbackForm.get('topics').value[idx].id,
            rating: this.feedbackForm.get('topics').value[idx].rating,
            notes: this.feedbackForm.get('topics').value[idx].extraFeedback,
          })
        })
        this._modalService.success('Thanks for sharing your feedback!')
      }
      else if( this.feedbackForm.get('option').value){
        this.analytics.trackEvent('feedback_submitted', {
          feedbackId: this.data.id,
          optionId: this.feedbackForm.get('option').value.id
        })
        this._modalService.success('Request for beta access received. We will get back to you soon')
      }
      else {
        this.analytics.trackEvent('feedback_dismissed' ,{
          feedbackId: this.data.id
        })
      }
      this.onCloseSubscription.unsubscribe();
    })

  }



  changeRating(event, topicIndex?: number) {
    if (this.readonly && this.readonly === 'true') return;
    if(this.mode == 'feedback-bulk'){
      let id = event.target.id ? parseInt(event.target.id) : parseInt(event.target.parentElement.id);
      let rating = (this.feedbackForm.get('topics') as FormArray).controls[topicIndex].value.rating
      let newRating = ((rating - id > 0) && (rating - id <= 0.5)) ? id + 1 : id + .5;
      //set rating for topic
      const topic = (this.feedbackForm.get('topics') as FormArray).controls[topicIndex] as FormGroup;
      topic.patchValue({
        rating: newRating
      });
    }
    else{
      // event is different for firefox and chrome
      let id = event.target.id ? parseInt(event.target.id) : parseInt(event.target.parentElement.id);
      if (this.halfStar === 'true') {
        this.rating = ((this.rating - id > 0) && (this.rating - id <= 0.5)) ? id + 1 : id + .5;
      } else {
        this.rating = id + 1;
      }
      this.feedbackForm.patchValue({
        rating: this.rating
      })
      this.displayReasons = true
    }
  }

  setRatingStarColor(index: number, rating) {
    rating =  Math.ceil(rating)
    if (index < rating) {
      return this.activeColor;
    }
    return this.defaultColor;
  }
  onCancel() {
    this._modalCtrl.dismiss()
  }
  // Assuming feedbackForm is of type FormGroup
  get reasonsFormArray() {
    return this.feedbackForm.get('reasons') as FormArray;
  }

  onOptionClick(index) {
    this.feedbackForm.patchValue({
      option: this.data.optionCards[index]
    })
    if(this.data.submitOnOptionClick){
      this.onSubmit()
    }
  }

  onNotInterested() {
    this.analytics.trackEvent('feedback_dismissed', {
      feedbackId:  this.data.id,
    })
    this.modalController.dismiss('not-interested', 'submit')
  }


  onSubmit() {

    this.feedbackForm.markAsTouched()
    if (this.mode == "feedback" && (this.feedbackForm.value.rating === null || this.feedbackForm.get('reasons').errors.noOptionSelected)) {
      return
    }

    if (this.mode == "poll" && (this.feedbackForm.get('reasons').errors.noOptionSelected || (this.data.reasons.includes('Other') && this.feedbackForm.get('reasons').value.slice(-1)[0]  && (this.feedbackForm.get('extraFeedback').value == null))) ) {
      console.log(this.feedbackForm.get('reasons').value)
      console.log(this.feedbackForm.get('reasons').value.slice(-1) )
      return
    }

    if (this.mode == "feedback-bulk" && this.feedbackForm.get('topics').errors) {
      return
    }

    if(this.mode == "option-cards" && this.feedbackForm.invalid){
      return
    }
    this.modalController.dismiss('submitted', 'submit')
  }

  protected readonly Option = Option;
}
