import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { ConsignmentSettingsFormComponent } from './consignment-settings-form.component';

describe('ConsignmentSettingsFormComponent', () => {
  let component: ConsignmentSettingsFormComponent;
  let fixture: ComponentFixture<ConsignmentSettingsFormComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ ConsignmentSettingsFormComponent ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(ConsignmentSettingsFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
