// installMixins (js/utils.js) lets Game and WeaponRig keep their methods in
// several files and still be one class with one `this`. This covers what both
// classes rely on:
//
// - every method, getter and setter of every part lands on the target's
//   prototype as the same function, and `this` is the instance;
// - a part's constructor neither runs nor replaces the target's;
// - a name defined twice, on the target and a part or in two parts, throws at
//   load naming the class and the method. Otherwise one copy would silently
//   win.
import assert from 'node:assert/strict';
import { loadGameModule } from './lib/headless-three.mjs';

const { installMixins } = await loadGameModule('utils.js');

class Target {
  constructor() { this.base = 2; }
  own() { return 'own'; }
}
class Doubling {
  constructor() { throw new Error('a part constructor must never run'); }
  double() { return this.base * 2; }
  get tripled() { return this.base * 3; }
  set tenths(v) { this.base = v / 10; }
}
class Quadrupling {
  quadruple() { return this.double() * 2; }
}
installMixins(Target, [Doubling, Quadrupling]);

const t = new Target();
assert.equal(t.base, 2, "the target's own constructor must still run");
assert.equal(Target.prototype.constructor, Target, "a part's constructor must not replace the target's");
assert.equal(Target.prototype.double, Doubling.prototype.double, 'a method is installed as the same function');
assert.equal(t.double(), 4, '`this` in an installed method is the instance');
assert.equal(t.quadruple(), 8, 'methods from different parts reach each other through `this`');
assert.equal(t.tripled, 6, 'a getter is installed as a getter');
t.tenths = 50;
assert.equal(t.base, 5, 'a setter is installed as a setter');
assert.equal(t.tripled, 15, 'an installed getter reads the instance on every access');
assert.deepEqual(Object.getOwnPropertyNames(Target.prototype).sort(),
  ['constructor', 'double', 'own', 'quadruple', 'tenths', 'tripled'].sort());

class Overriding { own() { return 'part'; } }
assert.throws(() => installMixins(Target, [Overriding]), { message: 'Target.own is defined twice' },
  "a part may not replace one of the target's own methods");
assert.equal(t.own(), 'own', "a rejected part must leave the target's method in place");

class Fresh {}
class MovesOne { move() {} }
class MovesTwo { move() {} }
assert.throws(() => installMixins(Fresh, [MovesOne, MovesTwo]), { message: 'Fresh.move is defined twice' },
  'two parts may not define the same name');

console.log('installMixins OK: methods, getters and setters installed as-is, the target constructor kept, '
  + 'and names defined twice throw with the class and method named.');
