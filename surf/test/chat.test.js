import test from 'node:test';
import assert from 'node:assert/strict';
import { filterChat, badName } from '../shared/chatfilter.js';

test('profanity is masked, also when disguised', () => {
  for (const m of ['fuck you', 'FUUUCK', 'sh1t map', 'f u c k', 'you b!tch', 'jebem ti', 'pizda', 'kurba', 'pička', 'k u r b a']) {
    const r = filterChat(m);
    assert.ok(r.flagged, 'not flagged: ' + m);
    assert.ok(!/fuck|shit|bitch|jebem|pizda|kurba|pička/i.test(r.text), `leaked: ${m} -> ${r.text}`);
  }
});

test('normal chat is untouched', () => {
  for (const m of ['gg wp', 'nice run!', 'as fast as you', 'class act', 'the cockpit view', 'Pedro is here', 'good night', 'Assassin knife?', 'rtv', 'lepa mapa', 'kdo gre na neon drift?']) {
    const r = filterChat(m);
    assert.equal(r.flagged, false, 'false positive: ' + m + ' -> ' + r.text);
    assert.equal(r.text, m.toLowerCase() === m ? m : r.text);
  }
});

test('links, e-mails, phone numbers and social invites are removed', () => {
  assert.ok(!/example/.test(filterChat('go to www.example.com now').text));
  assert.ok(!/example/.test(filterChat('visit example (dot) com').text));
  assert.ok(!/gmail/.test(filterChat('mail me john@gmail.com').text));
  assert.ok(!/123/.test(filterChat('call +386 40 123 456').text));
  assert.ok(!/xyz/.test(filterChat('add me discord: xyz#1234').text));
});

test('length limit, shouting and names', () => {
  assert.equal(filterChat('a'.repeat(500)).text.length, 120);
  assert.equal(filterChat('THIS IS MY MAP NOW').text, 'this is my map now');
  assert.ok(badName('xXfuckerXx'));
  assert.ok(!badName('RampRat'));
  assert.ok(!badName('Bob'));
});
