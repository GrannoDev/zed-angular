import { Component, input, InjectionToken, signal as writable } from '@angular/core';
import * as http from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormControl } from '@angular/forms';
import { NavigationEnd, type Routes } from '@angular/router';

export const routes: Routes = [];
export const endpoint = new InjectionToken<string>('endpoint');
export const clientType = http.HttpClient;
export const lastVisit = new FormControl(new Date());
export const eventType = NavigationEnd;
export const visitValue = lastVisit.value;

@Component({
  imports: [DatePipe],
  template: `@let value = visit(); @if (value) { <ng-container>{{ value | date }}</ng-container> }`,
})
export class Reference {
  readonly name = input.required<string>();
  readonly visit = writable(new Date());
  clear() { this.visit.set(new Date(0)); }
}

function signal() { return 1; }
export const ordinary = signal();
export const plainText = '@if (not a template)';

// Angular exposes this browser API in development mode without a Window declaration.
// @ts-expect-error Angular installs ng at runtime.
export const debugComponent = window.ng.getComponent(document.body);
