import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-reports',
  templateUrl: './reports.page.html',
  styleUrls: ['./reports.page.scss'],
})
export class ReportsPage implements OnInit {


  constructor(
    private router: Router,
  ) { }

  ngOnInit() {
  }

  onReportClicked(reportName: string) {
    this.router.navigate([`/reports/${reportName}`]);
  }


}
