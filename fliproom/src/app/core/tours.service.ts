import { ElementRef, Injectable } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import * as introJs from 'intro.js/intro.js';
import { Subject } from 'rxjs';
import { ModalService } from '../shared/modal/modal.service';
import { AnalyticsService } from './analytics.service';

import { filter, take } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ToursService {
  introJS = null;
  private _activeTour: string | null;
  private _activePage: string | null; //not in use
  private _currentStep: number = 0;
  private tourParams = {
    showBullets: false,
    disableInteraction: false,
    exitOnOverlayClick: false,
    overlayOpacity: "0.8",
    steps: []
  }

  public tourHighlightClickObs = new Subject<any>()
  constructor(
      private _route: ActivatedRoute,
      private router: Router,
      private _modalCtrl: ModalService,
      private _analytics: AnalyticsService
  ) { }

  startTour(tourName: string, params) {
    this._currentStep = 0
    this._activeTour = tourName
    switch (tourName) {
      case 'sell-item':
        this._startSellItemTour(params)
        break;
    }
  }


  _startSellItemTour(params) {
    /**
     * This function defines the sell-item tour steps and the behaviour of each step
     *
     * {
     *  page: page where the tour is started or resumed
     *  overwriteStep: step where the tour is started or resumed
     * }
     */
    this._activePage = params.page
    //steps builder
    switch (params.page) {
      case 'inventory-view':
        this.introJS = introJs(); // this is necessary to allow click functionality.. ionic bs took 3 hrs to figure out
        this.tourParams.steps = []
        this.tourParams.steps.push({
          id: 'sell-items',
          element: "#add-inventory",
          title: 'Step 1 of 6',
          intro: 'Click here to start selling your items',
          showButtons: false,
        })
        break;
      case 'product-search':
        this.introJS = introJs(); // this is necessary to allow click functionality.. ionic bs took 3 hrs to figure out
        this.tourParams.steps = []
        this.tourParams.steps.push({
          id: 'your-products',
          element: "#private",
          title: 'Step 2 of 6',
          intro: 'Here you find your products',
        })
        this.tourParams.steps.push({
          id: 'click-consignment',
          element: "#consignment",
          title: 'Step 3 of 6',
          intro: 'Here you find products to consign',
          nextButtonText: 'Search'
        })
        break;
      case 'inventory-form':
        this.introJS = introJs(); // this is necessary to allow click functionality.. ionic bs took 3 hrs to figure out
        this.tourParams.steps = []
        this.tourParams.steps.push({
          id: 'insert-quantity',
          element: "[tourId='add-quantity'] > div > div",
          title: 'Step 4 of 6',
          intro: 'Click here to insert the quantity to sell',
        })
        this.tourParams.steps.push({
          id: 'insert-payout',
          element: "[tourId='add-payout'] > div > div",
          title: 'Step 5 of 6',
          intro: 'Click here to insert your payout'
        })
        this.tourParams.steps.push({
          id: 'save',
          element: 'button[test-id="save"]',
          title: 'Step 6 of 6',
          intro: 'Click here to create the items to sell',
          showButtons: false,
          completed: true
        })
        break;
    }

    this.introJS.setOptions(this.tourParams).start();

    if (params.overwriteStep) {
      this.introJS.goToStepNumber(params.overwriteStep + 1);
    }

    //first step card rendering
    this.onStepCardRendering()

    //when step changes, we need to know at what step we are in so that we can apply the step config defined above
    const ctxRef = this
    this.introJS.onchange(function(data) {
      const introJSEvent = this
      //keep track of the current step
      ctxRef._saveCurrentStep(introJSEvent._currentStep)
      //emit event when step changes
      ctxRef.tourHighlightClickObs.next({action: 'step-change', stepId: ctxRef.tourParams.steps[ctxRef._currentStep].id})

      //step card rendering
      ctxRef.onStepCardRendering()
    });

    //add listeners - need to wait 0.5 sec after tutorial started so that div.introjs-helperLayer (the clickable element) is rendered
    setTimeout(() => {
      //// enable click on overlay - sends event to observable and various component can subscribe to it
      document.querySelector('div.introjs-helperLayer').addEventListener('click', (event) => {
        ctxRef.tourHighlightClickObs.next({action: 'click', stepId: ctxRef.tourParams.steps[ctxRef._currentStep].id})
      })

      //subscribe to user exiting/dismissing the tour, applys only on the cross button click - overlay click has been disabled. Prompt feedback
      document.querySelector('a.introjs-skipbutton').addEventListener('click', (event) => {
        // track event for analytics
        ctxRef._analytics.trackEvent('tour_dismissed', {name: ctxRef._activeTour, step: ctxRef.tourParams.steps[ctxRef._currentStep].id})

        // prompt user with option to resume tour
        this._modalCtrl.info(`Tour Dismissed`, 'resume').pipe(
            take(1),// take 1 so that when resume - we don't subscribe to dismiss too
        )
            .subscribe((actionName) => actionName === 'resume' ? ctxRef.onResume() : ctxRef.onTourDismissedOrCompleted())
      })
    }, 500)
  }

  onStepCardRendering() {
    // stepConfig.nextButtonText - customize next button text. Note: need to have a timeout otherwise updates the next of the previous element
    if (this.tourParams.steps[this._currentStep].nextButtonText) {
      setTimeout(() => {
        document.querySelector('.introjs-nextbutton').innerHTML = this.tourParams.steps[this._currentStep].nextButtonText;
      }, 300)
    }

    // stepConfig.showButtons -  show/hide action buttons - If step config has showButtons = false, hide action buttons
    if (this.tourParams.steps[this._currentStep].showButtons === false) {
      (document.querySelector('div.introjs-tooltipbuttons') as HTMLElement).style.display = 'none';
    } else if (document.querySelector('div.introjs-tooltipbuttons')) { //need to check if tooltipbuttons otherwise in some scenarios breaks
      (document.querySelector('div.introjs-tooltipbuttons') as HTMLElement).style.display = 'block';
    }
  }

  nextStep() {
    if (!this._activeTour) {
      return
    }
    const _introJs = this.introJS

    setTimeout( function() {
      _introJs.nextStep();
    },200);
  }

  _saveCurrentStep(stepIdx: number) {
    this._currentStep = stepIdx
  }

  onResume() {
    this._analytics.trackEvent('tour_resumed', {name: this._activeTour, step: this.tourParams.steps[this._currentStep].id})
    this.startTour(this._activeTour, {page: this._activePage, overwriteStep: this._currentStep})
  }

  completed() {
    this.introJS.exit(true)
    //triggered when the whole tourId has been completed
    if (this.tourParams.steps[this._currentStep].completed === true) {
      this._analytics.trackEvent('tour_finish', {name: this._activeTour})
      this._modalCtrl.actionCompleted().subscribe(() => {
        this.onTourDismissedOrCompleted()
      })
    }
  }

  onTourDismissedOrCompleted() {
    /**
     * This function is called when the tour is dismissed or completed. Prompt the feedback form
     */

    this._activeTour = null

    this._modalCtrl.rate({title: 'Feedback',
      subTitle: 'Was this helpful?',
      id: 'sell-item-tour',
      mode: 'feedback',
      reasons: [
        'Perfect',
        'I closed it by mistake',
        'Confusing',
        "I don't need it",
        "Is not working",
        "Other"
      ]}).subscribe(() => {})
  }

  get activeTour(): string | null {
    return this._activeTour
  }
}
