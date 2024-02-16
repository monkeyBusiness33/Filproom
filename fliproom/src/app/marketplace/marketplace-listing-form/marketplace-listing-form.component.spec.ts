import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarketplaceAddListingFormComponent } from './marketplace-listing-form.component';

describe('MarketplaceAddListingFormComponent', () => {
  let component: MarketplaceAddListingFormComponent;
  let fixture: ComponentFixture<MarketplaceAddListingFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MarketplaceAddListingFormComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MarketplaceAddListingFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
