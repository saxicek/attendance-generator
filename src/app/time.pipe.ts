import { Pipe, PipeTransform } from '@angular/core';

/**
 * Transform numeric value in minutes to hour:minutes string
 * @param value number of minutes
 */
export function time(value: number | undefined): string {
  if (!value) return '';
  const minutes = value % 60;
  const hours = (value - minutes) / 60;
  return value ? `${hours}:${String(minutes).padStart(2, '0')} (${value})` : value.toFixed(2);
}

@Pipe({
  name: 'time',
  standalone: true,
  pure: true,
})
export class TimePipe implements PipeTransform {
  transform(value: number, ...args: unknown[]): string {
    return time(value);
  }
}
