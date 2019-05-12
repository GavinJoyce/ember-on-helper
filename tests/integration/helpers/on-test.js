import { module, test, skip } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import {
  render,
  click,
  settled,
  setupOnerror,
  resetOnerror
} from '@ember/test-helpers';
import hbs from 'htmlbars-inline-precompile';
import { set } from '@ember/object';
import { run } from '@ember/runloop';
import { gte } from 'ember-compatibility-helpers';
import { compileTemplate } from '@ember/template-compilation';

module('Integration | Helper | on', function(hooks) {
  setupRenderingTest(hooks);
  hooks.afterEach(() => resetOnerror());
  hooks.beforeEach(function() {
    this.testElement = document.createElement('button');
    this.testElement.dataset.foo = 'test-element';

    this.testParentElement = document.createElement('div');
    this.testParentElement.append(this.testElement);
  });

  test('it basically works', async function(assert) {
    assert.expect(6);

    this.someMethod = function(event) {
      assert.ok(
        this instanceof HTMLButtonElement &&
          this.dataset.foo === 'test-element',
        'this context is the element'
      );
      assert.ok(
        event instanceof MouseEvent,
        'first argument is a `MouseEvent`'
      );
      assert.strictEqual(
        event.target.tagName,
        'BUTTON',
        'correct element tagName'
      );
      assert.dom(event.target).hasAttribute('data-foo', 'test-element');
    };

    await render(hbs`{{on this.testElement "click" this.someMethod}}`);

    assert.counts({ adds: 1, removes: 0 });

    await click(this.testElement);

    assert.counts({ adds: 1, removes: 0 });
  });

  test('it can accept the `once` option', async function(assert) {
    assert.expect(3);

    let n = 0;
    this.someMethod = () => n++;

    await render(
      hbs`{{on this.testElement "click" this.someMethod once=true}}`
    );

    assert.counts({ adds: 1, removes: 0 });

    await click(this.testElement);
    await click(this.testElement);

    assert.counts({ adds: 1, removes: 0 });

    assert.strictEqual(n, 1, 'callback has only been called once');
  });

  test('unrelated property changes do not break the `once` option', async function(assert) {
    assert.expect(5);

    let n = 0;
    this.someMethod = () => n++;
    this.someProperty = 0;

    await render(
      hbs`{{this.someProperty}}{{on this.testElement "click" this.someMethod once=true}}{{this.someProperty}}`
    );

    assert.counts({ adds: 1, removes: 0 });

    await click(this.testElement);
    await click(this.testElement);

    assert.counts({ adds: 1, removes: 0 });

    assert.strictEqual(n, 1, 'callback has only been called once');

    run(() => set(this, 'someProperty', 1));
    await settled();
    assert.counts({ adds: 1, removes: 0 });

    await click(this.testElement);
    assert.strictEqual(n, 1, 'callback has only been called once');
  });

  test('unrelated property changes do not cause the listener to re-register', async function(assert) {
    assert.expect(2);

    this.someMethod = () => {};
    this.someProperty = 0;

    await render(
      hbs`{{this.someProperty}}{{on this.testElement "click" this.someMethod}}{{this.someProperty}}`
    );
    assert.counts({ adds: 1, removes: 0 });

    run(() => set(this, 'someProperty', 1));
    await settled();
    assert.counts({ adds: 1, removes: 0 });
  });

  test('it can accept the `capture` option', async function(assert) {
    assert.expect(5);

    this.outerListener = () => assert.step('outer');
    this.innerListener = () => assert.step('inner');

    await render(hbs`
      {{on this.testParentElement "click" this.outerListener capture=true}}
      {{on this.testElement "click" this.innerListener}}
    `);

    assert.counts({ adds: 2, removes: 0 });

    await click(this.testElement);

    assert.counts({ adds: 2, removes: 0 });

    assert.verifySteps(
      ['outer', 'inner'],
      'outer capture listener was called first'
    );
  });

  test('it can accept the `once` & `capture` option combined', async function(assert) {
    assert.expect(6);

    this.outerListener = () => assert.step('outer');
    this.innerListener = () => assert.step('inner');

    await render(hbs`
    {{on this.testParentElement "click" this.outerListener once=true capture=true}}
    {{on this.testElement "click" this.innerListener}}
    `);

    assert.counts({ adds: 2, removes: 0 });

    await click(this.testElement);
    await click(this.testElement);

    assert.counts({ adds: 2, removes: 0 });

    assert.verifySteps(
      ['outer', 'inner', 'inner'],
      'outer capture listener was called first and was then unregistered'
    );
  });

  test('it raises an assertion when calling `event.preventDefault()` on a `passive` event', async function(assert) {
    assert.expect(3);

    this.handler = event => {
      assert.expectAssertion(
        () => event.preventDefault(),
        `ember-on-helper: You marked this listener as 'passive', meaning that you must not call 'event.preventDefault()'.`
      );
    };

    await render(
      hbs`{{on this.testElement "click" this.handler passive=true}}`
    );

    assert.counts({ adds: 1, removes: 0 });

    await click(this.testElement);

    assert.counts({ adds: 1, removes: 0 });
  });

  (gte('3.0.0') // I have no clue how to catch the error in Ember 2.13
    ? test
    : skip)('it raises an assertion if an invalid event option is passed in', async function(assert) {
    assert.expect(2);

    setupOnerror(function(error) {
      assert.strictEqual(
        error.message,
        "Assertion Failed: ember-on-helper: Provided invalid event options ('nope', 'foo') to 'click' event listener. Only these options are valid: 'capture', 'once', 'passive'",
        'error is thrown'
      );
    });

    await render(
      hbs`{{on this.testElement "click" this.someMethod nope=true foo=false}}`
    );

    assert.counts({ adds: 0, removes: 0 });
  });

  (gte('3.0.0') // I have no clue how to catch the error in Ember 2.13
    ? test
    : skip)('it raises an assertion if an invalid event name or callback is passed in', async function(assert) {
    // There is a bug in Glimmer when rendering helpers that throw an error
    setupOnerror(
      error => error.message.includes('lastNode') || assert.step(error.message)
    );

    const testExpression = async expression => {
      await render(
        compileTemplate(`
          {{#if this.runTest}}
            ${expression}
          {{/if}}
        `)
      );
      // If this was true initially, Glimmer would fail and could not recover
      // from it.
      run(() => set(this, 'runTest', true));
      await settled();
      run(() => set(this, 'runTest', false));
    };

    await testExpression(`{{on this.testElement "click" 10}}`);
    await testExpression(`{{on this.testElement "click"}}`);
    await testExpression(`{{on this.testElement "" undefined}}`);
    await testExpression(`{{on this.testElement 10 undefined}}`);
    await testExpression(`{{on this.testElement}}`);
    await testExpression(`{{on null 10 undefined}}`);
    await testExpression(`{{on}}`);

    assert.counts({ adds: 0, removes: 0 });

    assert.verifySteps([
      "Assertion Failed: ember-on-helper: '10' is not a valid callback. Provide a function.",
      "Assertion Failed: ember-on-helper: 'undefined' is not a valid callback. Provide a function.",
      "Assertion Failed: ember-on-helper: '' is not a valid event name. It has to be a string with a minimum length of 1 character.",
      "Assertion Failed: ember-on-helper: '10' is not a valid event name. It has to be a string with a minimum length of 1 character.",
      "Assertion Failed: ember-on-helper: 'undefined' is not a valid event name. It has to be a string with a minimum length of 1 character.",
      "Assertion Failed: ember-on-helper: 'null' is not a valid event target. It has to be an Element or an object that conforms to the EventTarget interface.",
      "Assertion Failed: ember-on-helper: 'undefined' is not a valid event target. It has to be an Element or an object that conforms to the EventTarget interface."
    ]);
  });

  (gte('3.0.0') // I have no clue how to catch the error in Ember 2.13
    ? test
    : skip)('it recovers after updating to incorrect parameters', async function(assert) {
    assert.expect(9);

    const errors = [];
    setupOnerror(error => errors.push(error));

    let n = 0;
    this.someMethod = () => n++;

    await render(hbs`{{on this.testElement "click" this.someMethod}}`);
    assert.counts({ adds: 1, removes: 0 });

    await click(this.testElement);
    assert.strictEqual(n, 1);
    assert.counts({ adds: 1, removes: 0 });

    run(() => set(this, 'someMethod', undefined));
    await settled();
    assert.counts({ adds: 1, removes: 1 });

    await click(this.testElement);
    assert.strictEqual(n, 1);
    assert.counts({ adds: 1, removes: 1 });

    run(() => set(this, 'someMethod', () => n++));
    await settled();
    assert.counts({ adds: 2, removes: 2 });

    await click(this.testElement);
    assert.strictEqual(n, 2);
    assert.counts({ adds: 2, removes: 2 });
  });

  test('it is re-registered, when the callback changes', async function(assert) {
    assert.expect(6);

    let a = 0;
    this.someMethod = () => a++;

    await render(hbs`{{on this.testElement "click" this.someMethod}}`);
    assert.counts({ adds: 1, removes: 0 });

    await click(this.testElement);
    assert.counts({ adds: 1, removes: 0 });

    let b = 0;
    run(() => set(this, 'someMethod', () => b++));
    await settled();
    assert.counts({ adds: 2, removes: 1 });

    await click(this.testElement);
    assert.counts({ adds: 2, removes: 1 });

    assert.strictEqual(a, 1);
    assert.strictEqual(b, 1);
  });

  test('it is re-registered, when the callback changes and `capture` is used', async function(assert) {
    assert.expect(9);

    let a = 0;
    this.someMethod = () => a++;
    this.capture = true;

    await render(
      hbs`{{on this.testElement "click" this.someMethod capture=this.capture}}`
    );
    assert.counts({ adds: 1, removes: 0 });

    await click(this.testElement);
    assert.counts({ adds: 1, removes: 0 });

    let b = 0;
    run(() => set(this, 'someMethod', () => b++));
    await settled();
    assert.counts({ adds: 2, removes: 1 });

    await click(this.testElement);
    assert.counts({ adds: 2, removes: 1 });

    let c = 0;
    run(() => {
      set(this, 'someMethod', () => c++);
      set(this, 'capture', false);
    });
    await settled();
    assert.counts({ adds: 3, removes: 2 });

    await click(this.testElement);
    assert.counts({ adds: 3, removes: 2 });

    assert.strictEqual(a, 1);
    assert.strictEqual(b, 1);
    assert.strictEqual(c, 1);
  });
});
