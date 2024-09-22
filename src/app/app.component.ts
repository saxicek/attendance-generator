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
  styles: `
  h1 {
    text-align: center;
    margin-top: 2rem;
  }
  `
})
export class AppComponent {
  title = 'attendance-generator';
}
