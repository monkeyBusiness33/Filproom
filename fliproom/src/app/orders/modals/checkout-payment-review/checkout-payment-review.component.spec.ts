import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { CheckoutPaymentReviewComponent } from './checkout-payment-review.component';

describe('CheckoutPaymentReviewComponent', () => {
  let component: CheckoutPaymentReviewComponent;
  let fixture: ComponentFixture<CheckoutPaymentReviewComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ CheckoutPaymentReviewComponent ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(CheckoutPaymentReviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
