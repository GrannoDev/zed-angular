import { Component, computed, input, signal } from '@angular/core';
import { NgClass, NgTemplateOutlet } from '@angular/common';
import { PickDirective } from './pick.directive';

@Component({
  selector: 'test-list',
  imports: [NgClass, PickDirective],
  template: `
    @if (visible()) {
      @for (item of items(); track item.id) {
        <p appPick [ngClass]="'item'">{{ item.name }}</p>
      } @empty { <p>No items</p> }
    } @else { <p>Hidden</p> }
    @switch (total()) {
      @case (1) { <p>One</p> }
      @default { <p>{{ total() }}</p> }
    }
    <!-- insert block -->
  `,
  styles: `:host { display: grid; }`,
})
export class List {
  readonly visible = input(true);
  readonly items = signal([{ id: 1, name: 'One' }]);
  readonly total = computed(() => this.items().length);
}

@Component({
  selector: 'test-card',
  imports: [NgClass, NgTemplateOutlet, PickDirective],
  templateUrl: './card.html',
  styles: ['p { color: red; }', 'p { margin: auto; }'],
})
export class Card {}
