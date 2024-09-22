import { Component } from '@angular/core';
import {FormComponent} from "./form/form.component";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormComponent],
  template: `
    <h1>Generátor docházky</h1>
    <app-form></app-form>
  `,
})
export class AppComponent {
  title = 'attendance-generator';
}
