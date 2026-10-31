// Run with: node test_site.cjs /path/to/jsdom
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require(process.argv[2]);
const root = __dirname;
const rows = JSON.parse(fs.readFileSync(path.join(root,'data.json')));
const milestones = JSON.parse(fs.readFileSync(path.join(root,'documented_milestones.json')));
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', e => errors.push(e.message));
virtualConsole.on('error', (...e) => errors.push(e.join(' ')));
const dom = new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'), {
  url:'http://localhost/', runScripts:'outside-only', virtualConsole,
  beforeParse(window) {
    window.fetch = async file => ({ok:true, json:async()=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'))});
    window.HTMLDialogElement.prototype.showModal = function(){this.open = true};
    window.HTMLDialogElement.prototype.close = function(){this.open = false};
  }
});
const {window} = dom, doc=window.document;
const $ = id => doc.getElementById(id);
const change = (id,value) => {$(id).value=value; $(id).dispatchEvent(new window.Event('change',{bubbles:true}));};
const click = element => {assert.ok(element); element.click();};
const displayedCount = () => Number($('result-count').textContent);
const timelineTiles = () => [...doc.querySelectorAll('#history-chart .history-tile')];
function checkTimeline(field, width){
  const dated=rows.filter(r=>r[field]!==null), undated=rows.filter(r=>r[field]===null);
  const tiles=timelineTiles();
  assert.equal(tiles.length,dated.length);
  assert.deepEqual(new Set(tiles.map(t=>t.dataset.country)),new Set(dated.map(r=>r.country)));
  assert.equal(doc.querySelectorAll('#undated-list button').length,undated.length);
  const columns=[...doc.querySelectorAll('.history-column')];
  for(const column of columns){
    const start=Number(column.querySelector('.history-year').textContent);
    const actual=[...column.querySelectorAll('.history-tile')].map(t=>t.dataset.country).sort();
    const expected=dated.filter(r=>r[field]>=start&&r[field]<start+width).map(r=>r.country).sort();
    assert.deepEqual(actual,expected,`interval ${start}`);
    const eventNames=[...column.querySelectorAll('.history-milestone')].map(t=>t.dataset.country).sort();
    const expectedEvents=field==='flag_origin_year'?Object.entries(milestones).filter(([,m])=>m.year>=start&&m.year<start+width).map(([country])=>country).sort():[];
    assert.deepEqual(eventNames,expectedEvents,`documented milestones in interval ${start}`);
  }
}
(async()=>{
  window.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));
  await new Promise(resolve=>window.setTimeout(resolve,30));
  assert.deepEqual(errors,[]);
  assert.equal(displayedCount(),rows.length);
  assert.equal(Number($('hero-count').textContent),rows.length);
  checkTimeline('flag_origin_year',20);
  const denmark=doc.querySelector('#undated-list [data-country="Denmark"]');
  assert.ok(denmark, 'Denmark must be visible among undated flags');
  assert.ok(denmark.querySelector('img'), 'Undated entries display their flag');
  click(denmark); assert.match($('detail-content').textContent,/Exact creation and first adoption years are unknown/); click($('close-dialog'));
  const marker=doc.querySelector('.history-milestone[data-country="Denmark"]');
  assert.ok(marker); assert.match(marker.textContent,/1398/); click(marker);
  assert.match($('detail-content').textContent,/royal seal dated 1398/); assert.match($('detail-content').textContent,/not its creation year/);click($('close-dialog'));
  change('history-bin','50'); checkTimeline('flag_origin_year',50);
  change('history-bin','100'); checkTimeline('flag_origin_year',100);
  change('history-measure','current_adoption_year'); checkTimeline('current_adoption_year',100);
  change('history-bin','50'); checkTimeline('current_adoption_year',50);
  change('history-bin','20'); checkTimeline('current_adoption_year',20);
  click(timelineTiles()[0]); assert.ok($('details').open); assert.ok($('detail-content').textContent.includes('History & symbolism')); click($('close-dialog')); assert.equal($('details').open,false);
  $('search').value='spain'; $('search').dispatchEvent(new window.Event('input',{bubbles:true}));
  assert.equal(displayedCount(),1); click(doc.querySelector('.card')); assert.match($('detail-content').textContent,/Charles III/); click($('close-dialog'));
  click($('reset')); click(doc.querySelector('[data-color="red"]')); click(doc.querySelector('[data-color="blue"]'));
  assert.equal(displayedCount(),rows.filter(r=>r.colors && r.colors.includes('red') && r.colors.includes('blue')).length);
  change('match','any'); assert.equal(displayedCount(),rows.filter(r=>r.colors && (r.colors.includes('red')||r.colors.includes('blue'))).length);
  change('match','exact'); assert.equal(displayedCount(),rows.filter(r=>r.colors && r.colors.length===2 && r.colors.includes('red') && r.colors.includes('blue')).length);
  click($('reset')); change('era','unknown'); assert.equal(displayedCount(),rows.filter(r=>r.flag_origin_year===null).length);
  click($('reset')); change('scope','UN member'); assert.equal(displayedCount(),rows.filter(r=>r.scope==='UN member').length);
  click($('reset')); click(doc.querySelector('#game-choices button')); assert.match($('score').textContent,/\/ 1/); assert.equal($('next').hidden,false); click($('next')); assert.equal($('next').hidden,true);
  assert.deepEqual(errors,[]);
  console.log(`PASS: ${rows.length} records, timeline bins and unknown lists, filters, details and quiz tested in jsdom.`);
  window.close();
})().catch(e=>{console.error(e);process.exitCode=1;window.close();});
