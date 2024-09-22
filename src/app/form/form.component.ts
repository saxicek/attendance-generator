import { Component, inject, OnInit, TrackByFunction } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  FormGroup,
  FormControl,
} from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatCardModule } from '@angular/material/card';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { time, TimePipe } from '../time.pipe';
import { MatTooltipModule } from '@angular/material/tooltip';
import { czechHolidays } from '../holidays';

interface AttendanceDay {
  /** Day of the month */
  day: number;
  /** Minutes worked in the morning */
  morning: number;
  /** When morning work started (in minutes) */
  morningStart?: number;
  /** When morning work stopped (in minutes) */
  morningEnd?: number;
  /** Minutes worked in the afternoon */
  afternoon: number;
  /** When afternoon work started (in minutes) */
  afternoonStart?: number;
  /** When afternoon work stopped (in minutes) */
  afternoonEnd?: number;
  /** Whether the day is working or non-working */
  working: boolean;
  /** Hours absent in given day */
  absent: number;
  /** Total minutes worked this day */
  total: number;
}

@Component({
  selector: 'app-form',
  templateUrl: './form.component.html',
  styleUrl: './form.component.css',
  standalone: true,
  imports: [
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatCheckboxModule,
    MatCardModule,
    MatTableModule,
    MatTooltipModule,
    ReactiveFormsModule,
    CommonModule, // for json pipe
    TimePipe,
  ],
})
export class FormComponent implements OnInit {
  readonly defaults = {
    /** year to generate for */
    year: new Date().getFullYear(),
    /** month to generate for */
    month: new Date().getMonth() + 1,
    /** number of hours worked during the day */
    attendanceHours: 8,
  };

  // setup variables
  readonly dailyVariance = 0.05;
  /** time for lunch in minutes */
  readonly lunchBreak = 60;
  /** time when lunch starts (in minutes) */
  readonly lunchTime = 12 * 60;
  /** time when working starts (in minutes) */
  readonly dayStart = 8 * 60;

  displayedColumns: string[] = [
    'customize',
    'absent',
    'day',
    'morningStart',
    'afternoonEnd',
    'morningEnd',
    'afternoonStart',
    'total',
  ];

  dayCount = 0;
  dayAttendance = new MatTableDataSource<AttendanceDay>();
  testResult: any = {};

  private fb = new FormBuilder().nonNullable;
  attendanceForm = this.fb.group({
    year: [this.defaults.year, Validators.required],
    month: [this.defaults.month, Validators.required],
    attendanceHours: [this.defaults.attendanceHours, Validators.required],
  });

  /**
   * Configuration of month days. Contains 31 "days", but shorter months
   * don't use it fully.
   */
  formArray = this.fb.array(
    Array.from({ length: 31 }, (_, i) => i + 1).map((x) =>
      this.fb.group({
        absent: [0],
        working: [true],
      })
    )
  );

  ngOnInit() {
    this.init(
      this.attendanceForm.controls.year.value,
      this.attendanceForm.controls.month.value
    );
    this.attendanceForm.controls.month.valueChanges.subscribe((month) =>
      this.init(this.attendanceForm.controls.year.value, month)
    );
    this.attendanceForm.controls.year.valueChanges.subscribe((year) =>
      this.init(year, this.attendanceForm.controls.month.value)
    );
    this.formArray.valueChanges.subscribe((_) =>
      this.recalculate(this.dayAttendance.data)
    );
    this.dayAttendance.connect().subscribe(console.log);
  }

  init(year: number, month: number) {
    if (year && month) {
      this.dayCount = this.getDaysInMonth(year, month);
      const dayAttendance = [];
      for (let d = 1; d <= this.dayCount; d++) {
        dayAttendance.push({
          day: d,
          morning: 0,
          afternoon: 0,
          working: this.isWorking(year, month, d),
          absent: 0,
          total: 0,
        });
      }
      // set the new value
      this.formArray.patchValue(
        dayAttendance.map((x) => ({
          absent: x.absent,
          working: x.working,
        }))
      );
      // enable / disable absent
      dayAttendance.forEach((x, i) =>
        x.working
          ? this.formArray.at(i).controls.absent.enable()
          : this.formArray.at(i).controls.absent.disable()
      );
      // this.dayAttendance.data = dayAttendance;
      // this.formArray.controls.forEach((control, i) =>
      //   control.controls.absent.valueChanges.subscribe(
      //     (absent) => (this.dayAttendance.data[i].absent = absent * 60)
      //   )
      // );
      // if (this.attendanceForm.controls.attendanceHours.pristine) {
      //   // set attendance hours to working days * 8 hours
      //   this.attendanceForm.controls.attendanceHours.setValue(dayAttendance.filter(day => day.working).length * 8);
      // }
      this.recalculate(dayAttendance);
    }
  }

  onSubmit(): void {
    this.recalculate(this.dayAttendance.data);
  }

  switchHoliday(day: number) {
    this.recalculate(
      this.dayAttendance.data.map((rec) =>
        rec.day === day ? { ...rec, working: !rec.working } : rec
      )
    );
    this.dayAttendance.data[day - 1].working
      ? this.formArray.at(day - 1).controls.absent.enable()
      : this.formArray.at(day - 1).controls.absent.disable();
  }

  recalculate(dayAttendance: AttendanceDay[]) {
    console.log('Recalculate: ');
    console.log(dayAttendance);
    dayAttendance = this.calculateDailyAttendance(
      dayAttendance,
      this.attendanceForm.controls.attendanceHours.value,
      this.dailyVariance
    );
    dayAttendance = this.calculateDaySplits(
      dayAttendance,
      this.dayStart,
      this.lunchBreak,
      this.lunchTime,
      this.dailyVariance
    );
    this.dayAttendance.data = dayAttendance;
    this.test();
  }

  calculateDaySplits(
    dayAttendance: AttendanceDay[],
    dayStart: number,
    lunchBreak: number,
    lunchTime: number,
    dailyVariance: number
  ): AttendanceDay[] {
    return dayAttendance.map((day, i) => {
      if (!day.working) return day;
      const absent = this.formArray.at(i).controls.absent.value * 60;
      const morningStart = this.valueWithVariance(dayStart, dailyVariance);
      const morningEnd = this.valueWithVariance(lunchTime, dailyVariance);
      if (day.total - absent <= morningEnd - morningStart) {
        return {
          ...day,
          absent,
          morningStart,
          morningEnd: morningStart + (day.total - absent),
          afternoonStart: 0,
          afternoonEnd: 0,
        };
      } else {
        const afternoonStart = this.valueWithVariance(
          lunchBreak + lunchTime,
          dailyVariance
        );
        return {
          ...day,
          absent,
          morningStart,
          morningEnd,
          afternoonStart,
          afternoonEnd:
            afternoonStart + day.total - morningEnd + morningStart - absent,
        };
      }
    });
  }

  test() {
    this.testResult.enteredMinutes =
      (this.attendanceForm.value.attendanceHours ?? 0) * 60;
    this.testResult.totalMinutes = this.dayAttendance.data.reduce(
      (sum, curr) => sum + curr.total,
      0
    );
  }

  getDaysInMonth(year: number, month: number) {
    // Month parameter is 1 indexed: 1 for January, 2 for February, etc.
    // Date constructor expects 0 indexed month, but 1 indexed day;
    // since we specify day 0, it is the last day of previous month,
    // i.e. new Date(2024, 2, 0) returns the last day in February
    return new Date(year, month, 0).getDate();
  }

  isWorking(year: number, month: number, day: number) {
    const d = new Date(`${year}-${month}-${day}`);
    const dateIso = d.toISOString().split('T')[0];
    return (
      d.getDay() !== 0 &&
      d.getDay() !== 6 &&
      !Object.keys(czechHolidays).includes(dateIso)
    );
  }

  calculateDailyAttendance(
    att: AttendanceDay[],
    dailyHours: number,
    variance: number
  ) {
    const workingDaysCount = att.reduce(
      (sum, curr) => (curr.working ? sum + 1 : sum),
      0
    );
    this.testResult.workingDays = workingDaysCount;
    const totalMinutes = Math.floor(workingDaysCount * dailyHours * 60);
    const dailyMinutes = totalMinutes / workingDaysCount;
    let usedMinutes = 0;
    let usedDays = 0;
    return att.map((day) => {
      if (day.working) {
        usedDays++;
        // if not the last day
        if (usedDays < workingDaysCount) {
          const minutes = this.valueWithVariance(dailyMinutes, variance);
          usedMinutes += minutes;
          return { ...day, total: minutes };
        } else {
          return { ...day, total: totalMinutes - usedMinutes };
        }
      } else {
        return day;
      }
    });
  }

  /**
   * Returns original value increased or decreased within the limits of variance
   */
  valueWithVariance(value: number, variance: number) {
    return Math.floor(value * (1 - variance / 2 + Math.random() * variance));
  }

  trackBy: TrackByFunction<AttendanceDay> = (
    index: number,
    value: AttendanceDay
  ) => {
    return value.day;
  };

  getControl(index: number, controlName: 'absent' | 'working'): FormControl {
    return (this.formArray.at(index) as FormGroup).get(
      controlName
    ) as FormControl;
  }

  copyToClipboard() {
    // formatter - minutes to hour:minute
    const textValue: string = this.dayAttendance.data
      .map(
        (d) =>
          `${time(d.morningStart)}\t${time(d.morningEnd)}\t${time(
            d.afternoonStart
          )}\t${time(d.afternoonEnd)}`
      )
      .join('\n');
    const textBlob = new Blob([textValue], { type: 'text/plain' });
    const clipboardItem = new ClipboardItem({ [textBlob.type]: textBlob });
    void navigator.clipboard.write([clipboardItem]);
  }
}
