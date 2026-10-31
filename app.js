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
const state = {rows:[], accounts:{}, curated:{}, milestones:{}, selected:new Set(), limit:24, score:0, rounds:0, pair:[], answered:false};
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

function checkedMilestones(rows, records){
  return Object.entries(records).map(([country,record])=>{
    const matches=rows.filter(row=>row.country===country);
    if(matches.length!==1 || matches[0].iso_alpha2!==record.iso_alpha2 || matches[0].flag_origin_year!==null || !Number.isInteger(record.year) || !['documented_depiction','documented_adoption','documented_regulation','documented_version_change'].includes(record.kind) || !record.description || !record.source_name || !record.status?.includes('not a creation date') || !safeURL(record.source)) throw new Error(`Invalid documented milestone for ${country}`);
    return {row:matches[0],...record};
  });
}

function historyData(rows, field, width){
  const dated = rows.filter(r => Number.isInteger(r[field]));
  const unknown = rows.filter(r => !Number.isInteger(r[field])).sort((a,b)=>a.country.localeCompare(b.country));
  const milestones=field==='flag_origin_year'?checkedMilestones(rows,state.milestones):[];
  if(!dated.length) return {dated, unknown, milestones, bins:[], max:0};
  const dates=dated.map(r=>r[field]).concat(milestones.map(m=>m.year));
  const first = Math.floor(Math.min(...dates)/width)*width;
  const last = Math.floor(Math.max(...dates)/width)*width;
  const bins = [];
  for(let start=first; start<=last; start+=width){
    bins.push({start, rows:dated.filter(r=>r[field]>=start && r[field]<start+width).sort((a,b)=>a[field]-b[field] || a.country.localeCompare(b.country)), milestones:milestones.filter(m=>m.year>=start && m.year<start+width).sort((a,b)=>a.year-b.year || a.row.country.localeCompare(b.row.country))});
  }
  return {dated, unknown, milestones, bins, max:Math.max(...bins.map(b=>b.rows.length))};
}

function renderHistory(){
  const field = $('history-measure').value, width = Number($('history-bin').value);
  const {dated,unknown,milestones,bins,max}=historyData(state.rows,field,width);
  if (!dated.length) { $('history-chart').textContent = 'No dates available.'; return; }
  const rowHeight=30, plotHeight = Math.max(150, max*rowHeight+35);
  const ticks=[];
  for(let n=0;n<=max;n+=10) ticks.push(`<span class="history-tick" style="bottom:${n*rowHeight}px">${n}</span>`);
  $('history-summary').textContent = `${dated.length} recorded ${field==='flag_origin_year'?'origins':'adoptions'} · ${unknown.length} unknown${milestones.length?` · ${milestones.length} separate milestones`:''}`;
  $('milestone-legend').hidden = !milestones.length;
  $('history-chart').innerHTML = `<div class="history-axis" style="height:${plotHeight}px"><span class="history-axis-title">FLAGS</span>${ticks.join('')}</div><div class="history-columns" style="--plot-height:${plotHeight}px">${bins.map(bin=>`<div class="history-column"><div class="history-stack" style="height:${plotHeight}px">${bin.rows.length ? `<span class="history-total">${bin.rows.length}</span>` : ''}${bin.rows.slice().reverse().map(row=>`<button type="button" class="history-tile" data-country="${escapeHTML(row.country)}" title="${escapeHTML(row.country)} · ${row[field]}" aria-label="${escapeHTML(row.country)}, ${row[field]}. Open details.">${row.image ? `<img src="${escapeHTML(row.image)}" alt="" loading="lazy">` : '<span>?</span>'}</button>`).join('')}</div><span class="history-year">${bin.start}</span><div class="history-milestones">${bin.milestones.map(m=>`<button type="button" class="history-milestone" data-country="${escapeHTML(m.row.country)}" title="${escapeHTML(m.row.country)} · ${m.year}: documented milestone, not a creation date" aria-label="${escapeHTML(m.row.country)}, ${m.year}: documented milestone, not a creation date. Open details.">${imageHTML(m.row)}<span>${m.year}</span></button>`).join('')}</div></div>`).join('')}</div>`;
  $('undated-summary').textContent = `${unknown.length} flags with ${field === 'flag_origin_year' ? 'unknown origin' : 'unknown adoption'} year`;
  document.querySelector('.undated-panel p').textContent = field==='flag_origin_year' ? 'Their origin year is unknown. Where supported, a different documented milestone appears below the timeline.' : 'No current adoption year is recorded for these entries.';
  $('undated-list').innerHTML = unknown.length ? unknown.map(r=>`<button type="button" data-country="${escapeHTML(r.country)}">${imageHTML(r)}<span>${escapeHTML(r.country)}</span></button>`).join('') : '<p>All entries have a recorded date for this measure.</p>';
}

function loadFlagImage(row){
  return new Promise((resolve,reject)=>{
    if(!row.image) return reject(new Error(`No illustration for ${row.country}`));
    const img=new Image();
    img.onload=()=>resolve([row.country,img]);
    img.onerror=()=>reject(new Error(`Could not load the flag of ${row.country}`));
    img.src=row.image;
  });
}

function drawFlag(ctx,img,x,y,width,height){
  const scale=Math.min(width/img.naturalWidth,height/img.naturalHeight);
  const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
  const left=x+(width-w)/2,top=y+(height-h)/2;
  ctx.drawImage(img,left,top,w,h);
  ctx.strokeStyle='#aab9af'; ctx.lineWidth=1; ctx.strokeRect(left+.5,top+.5,Math.max(0,w-1),Math.max(0,h-1));
}

async function createHistoryPNG(rows,field,interval){
  const {dated,unknown,milestones,bins,max}=historyData(rows,field,interval);
  if(!dated.length) throw new Error('There are no dated flags for this measure.');
  const images=new Map(await Promise.all(rows.map(loadFlagImage)));
  const margin=140, columnWidth=Math.max(96,Math.floor((2200-2*margin)/bins.length)), flagW=80, flagH=30, rowH=36;
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(2200,margin*2+bins.length*columnWidth);
  const plotTop=310, plotHeight=max*rowH+54, baseline=plotTop+plotHeight;
  const milestoneRows=Math.max(0,...bins.map(bin=>bin.milestones.length));
  const milestoneHeight=milestones.length?90+milestoneRows*55:0;
  const milestoneInfoHeight=milestones.length?Math.ceil(milestones.length/3)*34+40:0;
  const unknownTop=baseline+160+milestoneHeight+milestoneInfoHeight, unknownRowH=58, unknownColumns=4;
  const unknownHeight=Math.max(1,Math.ceil(unknown.length/unknownColumns))*unknownRowH;
  canvas.height=unknownTop+100+unknownHeight+115;
  const ctx=canvas.getContext('2d'); if(!ctx) throw new Error('Canvas is unavailable in this browser.');
  ctx.fillStyle='#f8f6ed'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#17343b'; ctx.font='700 26px sans-serif'; ctx.fillText('FLAG STORIES   /   A VISUAL ATLAS',margin,64);
  ctx.font='bold 58px Georgia, serif'; ctx.fillText(field==='flag_origin_year'?'The origins of flags':'When current flags were adopted',margin,142);
  ctx.fillStyle='#526d64'; ctx.font='25px sans-serif';
  ctx.fillText(`${dated.length} dated flags · ${unknown.length} without a recorded date · ${interval}-year intervals`,margin,193);
  ctx.font='22px sans-serif';
  ctx.fillText(field==='flag_origin_year'?'Origin dates can refer to designs, precursors, first use or adoption; they are not a uniform creation date.':'The current adoption year is distinct from the origin of a design or its colors.',margin,235);
  ctx.fillText('Each tile in the bars represents one flag. Column labels mark the first year of each interval.',margin,269);
  ctx.save(); ctx.globalAlpha=.11; ctx.fillStyle='#17343b'; ctx.font='bold 76px sans-serif';
  ctx.textAlign='center'; ctx.translate(canvas.width*.53,plotTop+plotHeight*.48); ctx.rotate(-.12); ctx.fillText('@Calcetinletal',0,0); ctx.restore();
  ctx.strokeStyle='#cbd6cb'; ctx.fillStyle='#5d756a'; ctx.font='21px sans-serif'; ctx.textAlign='right';
  for(let n=0;n<=max;n+=10){const y=baseline-n*rowH; ctx.beginPath();ctx.moveTo(margin-12,y);ctx.lineTo(canvas.width-margin+12,y);ctx.stroke();ctx.fillText(String(n),margin-24,y+7);}
  ctx.save();ctx.translate(38,plotTop+plotHeight/2);ctx.rotate(-Math.PI/2);ctx.textAlign='center';ctx.fillStyle='#526d64';ctx.font='bold 22px sans-serif';ctx.fillText('NUMBER OF FLAGS',0,0);ctx.restore();
  ctx.textAlign='center';
  bins.forEach((bin,index)=>{
    const x=margin+index*columnWidth+(columnWidth-flagW)/2;
    bin.rows.forEach((row,i)=>drawFlag(ctx,images.get(row.country),x,baseline-(i+1)*rowH,flagW,flagH));
    ctx.fillStyle='#17343b';ctx.font='bold 21px sans-serif';
    if(bin.rows.length) ctx.fillText(String(bin.rows.length),x+flagW/2,baseline-bin.rows.length*rowH-10);
    ctx.font='22px sans-serif';ctx.fillText(String(bin.start),x+flagW/2,baseline+38);
  });
  if(milestones.length){
    ctx.textAlign='left';ctx.fillStyle='#a4472a';ctx.font='bold 20px sans-serif';
    ctx.fillText('OUTLINED FLAGS: DOCUMENTED MILESTONES · ORIGIN UNKNOWN · NOT INCLUDED IN THE COUNTS ABOVE',margin,baseline+82);
    bins.forEach((bin,index)=>bin.milestones.forEach((milestone,i)=>{
      const x=margin+index*columnWidth+(columnWidth-flagW)/2,y=baseline+102+i*55;
      drawFlag(ctx,images.get(milestone.row.country),x,y,flagW,flagH);
      ctx.strokeStyle='#c75e37';ctx.lineWidth=3;ctx.strokeRect(x,y,flagW,flagH);
      ctx.fillStyle='#a4472a';ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.fillText(String(milestone.year),x+flagW/2,y+49);
    }));
    const kindLabel={documented_depiction:'depiction',documented_adoption:'adoption',documented_regulation:'regulation',documented_version_change:'version change'};
    const infoTop=baseline+112+milestoneRows*55,infoWidth=(canvas.width-margin*2)/3;
    ctx.font='20px sans-serif';ctx.fillStyle='#794a39';ctx.textAlign='left';
    milestones.forEach((m,i)=>ctx.fillText(`${m.row.country} ${m.year} · ${kindLabel[m.kind]}`,margin+(i%3)*infoWidth,infoTop+Math.floor(i/3)*34));
  }
  ctx.textAlign='left'; ctx.fillStyle='#17343b';ctx.font='bold 29px sans-serif';
  ctx.fillText(`UNKNOWN ${field==='flag_origin_year'?'ORIGIN':'ADOPTION'} YEAR  ·  ${unknown.length}`,margin,unknownTop);
  ctx.fillStyle='#526d64';ctx.font='21px sans-serif';ctx.fillText('Included separately because no reliable year is recorded in the supplied dataset.',margin,unknownTop+36);
  const cell=(canvas.width-margin*2)/unknownColumns;
  unknown.forEach((row,i)=>{
    const x=margin+(i%unknownColumns)*cell,y=unknownTop+58+Math.floor(i/unknownColumns)*unknownRowH;
    drawFlag(ctx,images.get(row.country),x,y,flagW,flagH);
    ctx.fillStyle='#17343b';ctx.font='22px sans-serif';
    let name=row.country; while(name.length>1&&ctx.measureText(name).width>cell-flagW-20) name=name.slice(0,-1);
    if(name!==row.country) name=name.trimEnd()+'…';
    ctx.fillText(name,x+flagW+12,y+22);
  });
  const footer=canvas.height-42;
  ctx.fillStyle='#17343b';ctx.font='bold 22px sans-serif';ctx.fillText('FLAG STORIES  ·  @Calcetinletal',margin,footer);
  ctx.textAlign='right';ctx.font='20px sans-serif';ctx.fillText('Sources: supplied dataset and milestone records · Flags: FlagCDN / Wikimedia Commons',canvas.width-margin,footer);
  ctx.font='18px sans-serif';ctx.fillText('calcetinletal.github.io/flag-atlas/',canvas.width-margin,footer+28);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG creation failed.')),'image/png'));
  return {blob,width:canvas.width,height:canvas.height};
}

async function downloadHistory(){
  const button=$('download-history'),status=$('download-status');
  const field=$('history-measure').value,interval=Number($('history-bin').value);
  button.disabled=true;status.textContent='Preparing the full-resolution PNG…';
  try {
    const result=await createHistoryPNG(state.rows,field,interval);
    const url=URL.createObjectURL(result.blob),link=document.createElement('a');
    link.href=url;link.download=`flag-stories-${field==='flag_origin_year'?'origins':'adoptions'}-${interval}y.png`;
    document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000);
    status.textContent=`Downloaded ${result.width.toLocaleString()} × ${result.height.toLocaleString()} px PNG.`;
  } catch(error) {console.error(error);status.textContent=`Could not create the chart: ${error.message}. Please try again.`;}
  finally {button.disabled=false;}
}

function details(row){
  const links = ['source_1_url','source_2_url','source_3_url'].map((key,i)=>safeURL(row[key]) ? `<a href="${escapeHTML(safeURL(row[key]))}" target="_blank" rel="noopener noreferrer">Source ${i+1} ↗</a>` : '').join('');
  const basis = row.origin_basis.replaceAll('_',' ');
  const colors = row.colors ? row.colors.map(c=>`<span class="dot" style="background:${palette[c]}"></span>${c}`).join(' ') : 'Unavailable';
  const account = state.accounts[row.country];
  const curated = state.curated[row.country];
  const milestone = state.milestones[row.country];
  const milestoneHTML = milestone ? `<div class="milestone-detail"><strong>DOCUMENTED MILESTONE · ${milestone.year}</strong><p>${escapeHTML(milestone.description)} <a href="${escapeHTML(safeURL(milestone.source))}" target="_blank" rel="noopener noreferrer">${escapeHTML(milestone.source_name)} ↗</a></p></div>` : '';
  let accountHTML = '<p>No sourced color account has been added for this entry yet. The date sources below may offer further context.</p>';
  if(curated) accountHTML = `<p>${escapeHTML(curated.text)}</p><p>${escapeHTML(curated.scope)} <a href="${escapeHTML(safeURL(curated.url))}" target="_blank" rel="noopener noreferrer">${escapeHTML(curated.source_name)} ↗</a></p>`;
  else if(account && account.status === 'variant_conflict') accountHTML = '<p>The archived source describes a different flag variant, so its account is not shown here. The color story for this variant remains to be researched.</p>';
  else if(account && account.status === 'profile_only') accountHTML = `<p>The archived profile does not provide a separately labelled history or meaning. <a href="${escapeHTML(safeURL(account.url))}" target="_blank" rel="noopener noreferrer">Read its flag description ↗</a></p>`;
  else if(account && account.status === 'excerpt') accountHTML = `<p class="account-label">ARCHIVED WORLD FACTBOOK · ${escapeHTML(account.kind.toUpperCase())}</p><blockquote>“${escapeHTML(account.excerpt)}”</blockquote><p>Short extract from a historical account, not necessarily an official or complete interpretation. <a href="${escapeHTML(safeURL(account.url))}" target="_blank" rel="noopener noreferrer">Read the full source ↗</a></p>`;
  $('detail-content').innerHTML = `<div class="detail-body"><div class="detail-image flag-frame">${imageHTML(row)}</div><p class="eyebrow">${escapeHTML(row.scope)} · ${escapeHTML(row.flag_variant)}</p><h2>${escapeHTML(row.country)}</h2><span class="detail-basis">Origin basis: ${escapeHTML(basis)}</span><div class="detail-grid"><div><small>ORIGIN YEAR</small><strong>${yearText(row)}</strong></div><div><small>CURRENT VERSION</small><strong>${row.current_version_year ?? 'Unknown'}</strong></div><div><small>CURRENT ADOPTION</small><strong>${row.current_adoption_year ?? 'Unknown'}</strong></div></div>${milestoneHTML}<div class="detail-colors">${colors}</div><div class="color-story"><h3>History &amp; symbolism</h3>${accountHTML}<p>Interpretations can differ, and the source may discuss a related state or civil flag. A flag’s colors can predate its recorded origin year.</p></div><p>${escapeHTML(row.notes)}</p><p>Source type: ${escapeHTML(row.source_type)} · Dataset verified as of ${escapeHTML(row.verified_as_of)}</p><div>${links}</div></div>`;
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
    const milestonesResponse=await fetch('documented_milestones.json');
    if(!milestonesResponse.ok) throw new Error('Documented milestone data unavailable.');
    state.milestones=await milestonesResponse.json();
    checkedMilestones(state.rows,state.milestones);
    for(const [file,key] of [['flag_accounts.json','accounts'],['curated_accounts.json','curated']]){
      try {const response=await fetch(file); if(response.ok) state[key]=await response.json();} catch(error) {console.warn(`${file} unavailable`,error);}
    }
    $('hero-count').textContent=state.rows.length; $('hero-dated').textContent=state.rows.filter(r=>r.flag_origin_year!==null).length;
    $('history-summary').insertAdjacentHTML('afterend','<p id="milestone-legend" class="milestone-legend"><span></span> Outlined flags below the years mark documented milestones for flags with unknown origins. They are not creation years and are not counted in the bars. Select one for its source.</p>');
    initColors(); render(); renderHistory(); nextRound();
    ['search','era','scope','match','sort'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',()=>{state.limit=24;render();}));
    $('reset').addEventListener('click',reset); $('empty-reset').addEventListener('click',reset);
    $('more').addEventListener('click',()=>{state.limit+=24;render();});
    $('cards').addEventListener('click',e=>{const card=e.target.closest('[data-country]'); if(card) details(state.rows.find(r=>r.country===card.dataset.country));});
    $('timeline').addEventListener('click',e=>{const bar=e.target.closest('[data-period]'); if(bar){$('era').value=bar.dataset.period;state.limit=24;render();}});
    ['history-measure','history-bin'].forEach(id=>$(id).addEventListener('change',renderHistory));
    $('download-history').addEventListener('click',downloadHistory);
    ['history-chart','undated-list'].forEach(id=>$(id).addEventListener('click',e=>{const tile=e.target.closest('[data-country]'); if(tile) details(state.rows.find(r=>r.country===tile.dataset.country));}));
    $('close-dialog').addEventListener('click',()=>$('details').close());
    $('details').addEventListener('click',e=>{if(e.target===$('details')) $('details').close();});
    $('game-choices').addEventListener('click',e=>{const choice=e.target.closest('[data-choice]'); if(choice) choose(Number(choice.dataset.choice));});
    $('next').addEventListener('click',nextRound);
  } catch(error){$('cards').innerHTML='<p>Sorry, the flag collection could not be loaded. Please refresh the page.</p>'; console.error(error);}
}
init();
