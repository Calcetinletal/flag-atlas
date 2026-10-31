'use strict';

const palette = {red:'#d95145',blue:'#366d9c',green:'#418365',yellow:'#e2c253',black:'#25353a',white:'#fff',orange:'#ed8952',purple:'#865e90',brown:'#835d43'};
const periods = [
  {id:'before1800', label:'<1800', test:y=>y<1800},
  {id:'1800', label:'1800s', test:y=>y>=1800&&y<1900},
  {id:'1900', label:'1900–49', test:y=>y>=1900&&y<1950},
  {id:'1950', label:'1950–99', test:y=>y>=1950&&y<2000},
  {id:'2000', label:'2000+', test:y=>y>=2000}
];
const $ = id => document.getElementById(id);
const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL = s => { try { const u = new URL(s); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const state = {rows:[], accounts:{}, curated:{}, selected:new Set(), limit:24, score:0, rounds:0, pair:[], answered:false};
const yearText = row => row.flag_origin_year == null ? 'Unknown' : (row.origin_basis.includes('approximate') ? 'c. ' : '') + row.flag_origin_year;
const scopeText = scope => scope === 'UN member' ? 'UN member' : scope.replace('Additional ', '');
const imageHTML = row => row.image ? `<img src="${escapeHTML(row.image)}" alt="" loading="lazy">` : '<span class="missing-flag">ILLUSTRATION<br>UNAVAILABLE</span>';
const dotsHTML = colors => (colors || []).map(c => `<span class="dot" style="background:${palette[c]}" title="${c}"></span>`).join('');

function initColors(){
  $('colors').innerHTML = Object.entries(palette).map(([name,color]) => `<button type="button" class="color-option" data-color="${name}" aria-pressed="false"><span class="swatch" style="--swatch:${color}"></span>${name}</button>`).join('');
  $('colors').addEventListener('click', event => {
    const button = event.target.closest('[data-color]'); if(!button) return;
    const color = button.dataset.color;
    state.selected.has(color) ? state.selected.delete(color) : state.selected.add(color);
    button.setAttribute('aria-pressed', String(state.selected.has(color)));
    $('color-count').textContent = `${state.selected.size} selected`;
    state.limit = 24; render();
  });
}

function filteredRows(){
  const query = $('search').value.trim().toLocaleLowerCase();
  const era = $('era').value, scope = $('scope').value, mode = $('match').value;
  return state.rows.filter(row => {
    if(query && !row.country.toLocaleLowerCase().includes(query)) return false;
    if(scope === 'UN member' && row.scope !== scope) return false;
    if(scope === 'other' && row.scope === 'UN member') return false;
    if(era === 'unknown' && row.flag_origin_year !== null) return false;
    if(era !== 'all' && era !== 'unknown' && (row.flag_origin_year === null || !periods.find(p=>p.id===era).test(row.flag_origin_year))) return false;
    if(state.selected.size){
      if(!row.colors) return false;
      const colors = new Set(row.colors), selected = [...state.selected];
      if(mode === 'any' && !selected.some(c=>colors.has(c))) return false;
      if(mode !== 'any' && !selected.every(c=>colors.has(c))) return false;
      if(mode === 'exact' && colors.size !== state.selected.size) return false;
    }
    return true;
  });
}

function render(){
  const rows = filteredRows();
  const sort = $('sort').value;
  rows.sort((a,b) => sort === 'name' ? a.country.localeCompare(b.country) : (a.flag_origin_year === null ? 1 : b.flag_origin_year === null ? -1 : (sort === 'oldest' ? a.flag_origin_year-b.flag_origin_year : b.flag_origin_year-a.flag_origin_year)) || a.country.localeCompare(b.country));
  $('result-count').textContent = rows.length;
  const counts = periods.map(p => rows.filter(r=>r.flag_origin_year !== null && p.test(r.flag_origin_year)).length);
  const max = Math.max(1,...counts);
  $('timeline').innerHTML = periods.map((p,i) => { const h = Math.round(counts[i]/max*68); return `<button class="bar-wrap ${$('era').value===p.id?'active':''}" data-period="${p.id}" title="${p.label}: ${counts[i]}" aria-label="${p.label}: ${counts[i]} flags. Filter this period."><span class="bar-value" style="--height:${h}px">${counts[i]}</span><span class="bar" style="height:${h}px"></span><span class="bar-label">${p.label}</span></button>`; }).join('');
  const cards = rows.slice(0,state.limit);
  $('cards').innerHTML = cards.map(row=>`<button class="card" type="button" data-country="${escapeHTML(row.country)}" aria-label="Explore ${escapeHTML(row.country)}"><span class="flag-frame">${imageHTML(row)}</span><span class="card-top"><span class="card-name">${escapeHTML(row.country)}</span><span class="card-year">${yearText(row)}</span></span><span class="card-type">${escapeHTML(scopeText(row.scope))}</span><span class="dots">${dotsHTML(row.colors)}</span></button>`).join('');
  $('empty').hidden = rows.length !== 0;
  $('more').hidden = rows.length <= state.limit;
}

function reset(){
  $('search').value = ''; $('era').value = 'all'; $('scope').value = 'all'; $('match').value = 'all'; $('sort').value = 'name';
  state.selected.clear(); state.limit=24; $('color-count').textContent='0 selected';
  document.querySelectorAll('.color-option').forEach(b=>b.setAttribute('aria-pressed','false'));
  render();
}

function renderHistory(){
  const field = $('history-measure').value, width = Number($('history-bin').value);
  const dated = state.rows.filter(r => Number.isInteger(r[field]));
  const unknown = state.rows.filter(r => !Number.isInteger(r[field]));
  if (!dated.length) { $('history-chart').textContent = 'No dates available.'; return; }
  const first = Math.floor(Math.min(...dated.map(r=>r[field]))/width)*width;
  const last = Math.floor(Math.max(...dated.map(r=>r[field]))/width)*width;
  const bins = [];
  for(let start=first; start<=last; start+=width){
    bins.push({start, rows:dated.filter(r=>r[field]>=start && r[field]<start+width).sort((a,b)=>a[field]-b[field] || a.country.localeCompare(b.country))});
  }
  const max = Math.max(...bins.map(b=>b.rows.length));
  const plotHeight = Math.max(110, max*20+27);
  $('history-summary').textContent = `${dated.length} dated entries · ${unknown.length} without a date`;
  $('history-chart').innerHTML = `<div class="history-axis" style="height:${plotHeight}px"><span>NUMBER<br>OF FLAGS</span><b>${max}</b><b>0</b></div><div class="history-columns" style="--plot-height:${plotHeight}px">${bins.map(bin=>`<div class="history-column"><div class="history-stack" style="height:${plotHeight}px">${bin.rows.length ? `<span class="history-total">${bin.rows.length}</span>` : ''}${bin.rows.slice().reverse().map(row=>`<button type="button" class="history-tile" data-country="${escapeHTML(row.country)}" title="${escapeHTML(row.country)} · ${row[field]}" aria-label="${escapeHTML(row.country)}, ${row[field]}. Open details.">${row.image ? `<img src="${escapeHTML(row.image)}" alt="" loading="lazy">` : '<span>?</span>'}</button>`).join('')}</div><span class="history-year">${bin.start}</span></div>`).join('')}</div>`;
  $('undated-summary').textContent = `${unknown.length} entries without ${field === 'flag_origin_year' ? 'an origin' : 'an adoption'} year`;
  $('undated-list').innerHTML = unknown.map(r=>`<button type="button" data-country="${escapeHTML(r.country)}">${escapeHTML(r.country)} ↗</button>`).join('');
}

function details(row){
  const links = ['source_1_url','source_2_url','source_3_url'].map((key,i)=>safeURL(row[key]) ? `<a href="${escapeHTML(safeURL(row[key]))}" target="_blank" rel="noopener noreferrer">Source ${i+1} ↗</a>` : '').join('');
  const basis = row.origin_basis.replaceAll('_',' ');
  const colors = row.colors ? row.colors.map(c=>`<span class="dot" style="background:${palette[c]}"></span>${c}`).join(' ') : 'Unavailable';
  const account = state.accounts[row.country];
  const curated = state.curated[row.country];
  let accountHTML = '<p>No sourced color account has been added for this entry yet. The date sources below may offer further context.</p>';
  if(curated) accountHTML = `<p>${escapeHTML(curated.text)}</p><p>${escapeHTML(curated.scope)} <a href="${escapeHTML(safeURL(curated.url))}" target="_blank" rel="noopener noreferrer">${escapeHTML(curated.source_name)} ↗</a></p>`;
  else if(account && account.status === 'variant_conflict') accountHTML = '<p>The archived source describes a different flag variant, so its account is not shown here. The color story for this variant remains to be researched.</p>';
  else if(account && account.status === 'profile_only') accountHTML = `<p>The archived profile does not provide a separately labelled history or meaning. <a href="${escapeHTML(safeURL(account.url))}" target="_blank" rel="noopener noreferrer">Read its flag description ↗</a></p>`;
  else if(account && account.status === 'excerpt') accountHTML = `<p class="account-label">ARCHIVED WORLD FACTBOOK · ${escapeHTML(account.kind.toUpperCase())}</p><blockquote>“${escapeHTML(account.excerpt)}”</blockquote><p>Short extract from a historical account, not necessarily an official or complete interpretation. <a href="${escapeHTML(safeURL(account.url))}" target="_blank" rel="noopener noreferrer">Read the full source ↗</a></p>`;
  $('detail-content').innerHTML = `<div class="detail-body"><div class="detail-image flag-frame">${imageHTML(row)}</div><p class="eyebrow">${escapeHTML(row.scope)} · ${escapeHTML(row.flag_variant)}</p><h2>${escapeHTML(row.country)}</h2><span class="detail-basis">Origin basis: ${escapeHTML(basis)}</span><div class="detail-grid"><div><small>ORIGIN YEAR</small><strong>${yearText(row)}</strong></div><div><small>CURRENT VERSION</small><strong>${row.current_version_year ?? 'Unknown'}</strong></div><div><small>CURRENT ADOPTION</small><strong>${row.current_adoption_year ?? 'Unknown'}</strong></div></div><div class="detail-colors">${colors}</div><div class="color-story"><h3>History &amp; symbolism</h3>${accountHTML}<p>Interpretations can differ, and the source may discuss a related state or civil flag. A flag’s colors can predate its recorded origin year.</p></div><p>${escapeHTML(row.notes)}</p><p>Source type: ${escapeHTML(row.source_type)} · Dataset verified as of ${escapeHTML(row.verified_as_of)}</p><div>${links}</div></div>`;
  $('details').showModal();
}

function nextRound(){
  const pool = state.rows.filter(r=>r.image && r.flag_origin_year !== null);
  if(pool.length < 2) return;
  const a = pool[Math.floor(Math.random()*pool.length)];
  const others = pool.filter(r=>r.flag_origin_year !== a.flag_origin_year);
  if(!others.length) return;
  const b = others[Math.floor(Math.random()*others.length)];
  state.pair=[a,b]; state.answered=false;
  $('game-choices').innerHTML = state.pair.map((r,i)=>`<button class="game-choice" data-choice="${i}">${imageHTML(r)}<strong>${escapeHTML(r.country)}</strong><small>Choose this flag ↗</small></button>`).join('');
  $('game-feedback').textContent='Which design has the earlier origin?'; $('next').hidden=true;
}
function choose(index){
  if(state.answered) return;
  state.answered=true; const [a,b]=state.pair, older=a.flag_origin_year < b.flag_origin_year ? 0 : 1;
  state.rounds++; if(index===older) state.score++;
  $('score').innerHTML=`${state.score} <small>/ ${state.rounds}</small>`;
  document.querySelectorAll('.game-choice').forEach((button,i)=>{button.disabled=true; button.querySelector('small').textContent=`Origin: ${yearText(state.pair[i])}`;});
  $('game-feedback').textContent = `${index===older?'Correct!':'Not quite!'} ${state.pair[older].country} has the earlier recorded origin in this dataset.`;
  $('next').hidden=false;
}

async function init(){
  try {
    const response=await fetch('data.json'); if(!response.ok) throw new Error(`HTTP ${response.status}`);
    state.rows=await response.json();
    for(const [file,key] of [['flag_accounts.json','accounts'],['curated_accounts.json','curated']]){
      try {const response=await fetch(file); if(response.ok) state[key]=await response.json();} catch(error) {console.warn(`${file} unavailable`,error);}
    }
    $('hero-count').textContent=state.rows.length; $('hero-dated').textContent=state.rows.filter(r=>r.flag_origin_year!==null).length;
    initColors(); render(); renderHistory(); nextRound();
    ['search','era','scope','match','sort'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',()=>{state.limit=24;render();}));
    $('reset').addEventListener('click',reset); $('empty-reset').addEventListener('click',reset);
    $('more').addEventListener('click',()=>{state.limit+=24;render();});
    $('cards').addEventListener('click',e=>{const card=e.target.closest('[data-country]'); if(card) details(state.rows.find(r=>r.country===card.dataset.country));});
    $('timeline').addEventListener('click',e=>{const bar=e.target.closest('[data-period]'); if(bar){$('era').value=bar.dataset.period;state.limit=24;render();}});
    ['history-measure','history-bin'].forEach(id=>$(id).addEventListener('change',renderHistory));
    ['history-chart','undated-list'].forEach(id=>$(id).addEventListener('click',e=>{const tile=e.target.closest('[data-country]'); if(tile) details(state.rows.find(r=>r.country===tile.dataset.country));}));
    $('close-dialog').addEventListener('click',()=>$('details').close());
    $('details').addEventListener('click',e=>{if(e.target===$('details')) $('details').close();});
    $('game-choices').addEventListener('click',e=>{const choice=e.target.closest('[data-choice]'); if(choice) choose(Number(choice.dataset.choice));});
    $('next').addEventListener('click',nextRound);
  } catch(error){$('cards').innerHTML='<p>Sorry, the flag collection could not be loaded. Please refresh the page.</p>'; console.error(error);}
}
init();
