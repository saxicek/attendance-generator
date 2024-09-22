import {Component, inject, OnInit, TrackByFunction} from '@angular/core';
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
import {time, TimePipe} from '../time.pipe';
import { MatTooltipModule } from '@angular/material/tooltip';

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
    month: new Date().getMonth(),
    /** number of hours worked during the month */
    attendanceHours: 160,
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
    'morningEnd',
    'afternoonStart',
    'afternoonEnd',
    'morning',
    'afternoon',
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

  formArray = this.fb.array(
    this.dayAttendance.data.map((x) =>
      this.fb.group({
        absent: [x.absent],
        working: [x.working],
      })
    )
  );

  ngOnInit() {
    this.init();
    this.attendanceForm.controls.month.valueChanges.subscribe(() =>
      this.init()
    );
    this.attendanceForm.controls.year.valueChanges.subscribe(() => this.init());
    this.dayAttendance.connect().subscribe(console.log);
  }

  init() {
    const v = this.attendanceForm.value;
    if (v.year && v.month) {
      this.dayCount = this.getDaysInMonth(v.year, v.month);
      const dayAttendance = [];
      for (let d = 1; d <= this.dayCount; d++) {
        dayAttendance.push({
          day: d,
          morning: 0,
          afternoon: 0,
          working: this.isWorking(v.year, v.month, d),
          absent: 0,
          total: 0,
        });
      }
      this.formArray = this.fb.array(
        dayAttendance.map((x) =>
          this.fb.group({
            absent: [{value: x.absent, disabled: !x.working}],
            working: [x.working],
          })
        )
      );
      this.formArray.controls.forEach((control, i) => control.controls.absent.valueChanges.subscribe((absent) => this.dayAttendance.data[i].absent = absent * 60));
      this.dayAttendance.data = dayAttendance;
      if (this.attendanceForm.controls.attendanceHours.pristine) {
        // set attendance hours to working days * 8 hours
        this.attendanceForm.controls.attendanceHours.setValue(dayAttendance.filter(day => day.working).length * 8);
      }
    }
  }

  onSubmit(): void {
    this.recalculate(this.dayAttendance.data);
  }

  absent(day: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    this.recalculate(
      this.dayAttendance.data.map((rec) =>
        rec.day === day ? { ...rec, absent: value} : rec
      )
    );
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
    return dayAttendance.map((day) => {
      if (!day.working) return day;
      const morningStart = this.valueWithVariance(dayStart, dailyVariance);
      const morningEnd = this.valueWithVariance(lunchTime, dailyVariance);
      if ((day.total - day.absent) <= (morningEnd - morningStart)) {
        return {
          ...day,
          morningStart,
          morningEnd: morningStart + (day.total - day.absent),
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
          morningStart,
          morningEnd,
          afternoonStart,
          afternoonEnd: afternoonStart + day.total - morningEnd + morningStart - day.absent,
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
    // Month is 1 indexed: 1 for January, 2 for February, etc.
    return new Date(year, month, 0).getDate();
  }

  isWorking(year: number, month: number, day: number) {
    const d = new Date(`${year}-${month}-${day}`);
    return d.getDay() !== 0 && d.getDay() !== 6;
  }

  calculateDailyAttendance(
    att: AttendanceDay[],
    totalHours: number,
    variance: number
  ) {
    const workingDaysCount = att.reduce(
      (sum, curr) => (curr.working ? sum + 1 : sum),
      0
    );
    this.testResult.workingDays = workingDaysCount;
    const totalMinutes = Math.floor(totalHours * 60);
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
      .map(d => `${time(d.morningStart)}\t${time(d.morningEnd)}\t${time(d.afternoonStart)}\t${time(d.afternoonEnd)}`)
      .join('\n');
    const textBlob = new Blob([textValue], { type: 'text/plain' });
    const clipboardItem = new ClipboardItem({ [textBlob.type]: textBlob});
    void navigator.clipboard.write([clipboardItem]);
  }
}
