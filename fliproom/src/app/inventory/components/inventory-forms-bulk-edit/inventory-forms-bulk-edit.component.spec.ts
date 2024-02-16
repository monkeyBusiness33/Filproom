import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { InventoryFormsBulkEditComponent } from './inventory-forms-bulk-edit.component';

describe('InventoryFormsBulkEditComponent', () => {
  let component: InventoryFormsBulkEditComponent;
  let fixture: ComponentFixture<InventoryFormsBulkEditComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ InventoryFormsBulkEditComponent ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(InventoryFormsBulkEditComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
