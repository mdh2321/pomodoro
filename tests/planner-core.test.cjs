const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../planner-core.js');
const date = '2026-10-21';
const task = (id, startTime, estimatedMinutes, more = {}) => ({id, startTime, estimatedMinutes, scheduledDate: date, ...more});

test('first-fit uses a sufficient gap and skips past and completed reservations', () => {
  const tasks = [task('a','09:00',60,{completed:true}), task('b','10:30',60)];
  assert.equal(S.firstGap(tasks,date,30,540),600);
  assert.equal(S.firstGap(tasks,date,45,540),690);
  assert.equal(S.firstGap(tasks,date,45,1425),null);
});
test('moving pushes a chain, preserving duration and task data', () => {
  const source = [task('a','09:00',60,{actualSeconds:720}),task('b','10:00',30),task('c','10:30',60)];
  const result=S.place(source,'a',600,date,90);
  assert.equal(result.ok,true);
  assert.equal(result.tasks.find(t=>t.id==='b').startTime,'11:30');
  assert.equal(result.tasks.find(t=>t.id==='c').startTime,'12:00');
  assert.equal(result.tasks[0].actualSeconds,720);
  assert.equal(source[0].startTime,'09:00');
});
test('overflow is rejected atomically, including a pushed item starting at midnight', () => {
  const source=[task('a','22:00',60),task('b','23:00',60)];
  assert.equal(S.place(source,'a',1380,date,60).ok,false);
  assert.equal(source[1].startTime,'23:00');
  assert.equal(S.place(source,'a',null,date).ok,false);
});
test('nesting and unplanning preserve accrued time and estimates', () => {
  const source=[task('a','09:00',30,{actualSeconds:1200}),task('b','11:00',60,{isBlock:true})];
  const nested=S.nest(source,'a','b');
  assert.equal(nested.tasks[0].estimatedMinutes,30);
  assert.equal(nested.tasks[0].actualSeconds,1200);
  assert.equal(S.events(nested.tasks,date).length,1);
  assert.equal(S.owner(nested.tasks[0],nested.tasks,date).id,'b');
  const free=S.unplan(nested.tasks,'a');
  assert.equal(S.owner(free.tasks[0],free.tasks,date),null);
  assert.equal(free.tasks[0].estimatedMinutes,30);
  assert.equal(S.nest(source,'b','a').ok,false);
});
test('yesterday and Not now never reserve today; block resize preserves members', () => {
  const source=[task('a','09:00',30,{scheduledDate:'2026-10-20'}),task('b','10:00',60,{notNow:true}),task('c','11:00',90,{isBlock:true}),{id:'d',blockId:'c',estimatedMinutes:25}];
  assert.equal(S.events(source,date).length,1);
  const result=S.place(source,'c',720,date,120);
  assert.equal(result.tasks[3].estimatedMinutes,25);
  assert.equal(result.tasks[3].blockId,'c');
  assert.equal(S.owner(result.tasks[3],result.tasks,date).startTime,'12:00');
});
