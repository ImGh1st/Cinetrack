(() => {
  "use strict";
  const DB_KEY = "cinetrack.library.v1";
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "ct-" + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const now = () => new Date().toISOString();
  const state = { media: [], collections: [], memberships: [], seasons: [], episodes: [], progress: [], view:"home", query:"", filters:{type:"all",status:"all",sort:"added"}, activeCollection:null, discoverFilter:"all" };
  let toastTimer;
  function toast(message) {
    const el = $("#toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
  }
  function persist() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify({version:1, exportedAt:now(), media:state.media, collections:state.collections, memberships:state.memberships, seasons:state.seasons, episodes:state.episodes, progress:state.progress}));
    } catch (e) { toast("Could not save: device storage may be full. Export a backup and remove large poster URLs."); }
  }
  function load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      for (const key of ["media","collections","memberships","seasons","episodes","progress"]) state[key] = Array.isArray(data[key]) ? data[key] : [];
    } catch { toast("Saved data could not be read. Import a valid backup to recover your library."); }
  }
  function esc(s="") { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function num(v) { if(v === "" || v == null) return null; const n=Number(v); return Number.isFinite(n)?n:null; }
  function yearText(item) { return item.year ? String(item.year) : "Year unknown"; }
  function statusLabel(s) { return ({planned:"Want to watch",watching:"Watching",watched:"Watched",on_hold:"On hold",dropped:"Dropped"})[s] || "Want to watch"; }
  function typeLabel(t) { return t === "series" ? "Series" : "Movie"; }
  function getMedia(id) { return state.media.find(m=>m.id===id); }
  function titleSort(a,b) { return a.title.localeCompare(b.title, undefined, {sensitivity:"base"}); }
  function matchingMedia(query) {
    const q = query.trim().toLowerCase();
    return state.media.filter(m => !q || [m.title,m.originalTitle,m.year,m.genres?.join(" "),m.notes].some(v=>String(v||"").toLowerCase().includes(q)));
  }
  function mediaMatchesFilters(items) {
    let out = items.filter(m => {
      if (state.filters.type !== "all" && m.type !== state.filters.type) return false;
      if (state.filters.status !== "all" && m.status !== state.filters.status) return false;
      return true;
    });
    const sort=state.filters.sort;
    if(sort==="title") out.sort(titleSort);
    else if(sort==="year") out.sort((a,b)=>(b.year||0)-(a.year||0));
    else if(sort==="rating") out.sort((a,b)=>(b.imdbRating??-1)-(a.imdbRating??-1));
    else if(sort==="personal") out.sort((a,b)=>(b.personalRating??-1)-(a.personalRating??-1));
    else out.sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
    return out;
  }
  function placeholder(m) {
    const initial = esc((m.title||"?").trim().slice(0,1).toUpperCase());
    return `<div class="poster-placeholder"><span class="poster-small">${esc(typeLabel(m.type))} · ${esc(yearText(m))}</span><span class="poster-monogram">${initial}</span><span class="poster-title">${esc(m.title)}</span></div>`;
  }
  function poster(m) {
    const img = m.posterUrl ? `<img src="${esc(m.posterUrl)}" alt="${esc(m.title)} poster" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
    return `<div class="poster-wrap">${img}${placeholder(m)}${m.imdbRating!=null?`<span class="rating-pill">★ ${Number(m.imdbRating).toFixed(1)}</span>`:""}<span class="type-pill">${m.type==="series"?"SERIES":"FILM"}</span><div class="poster-overlay"><button data-action="edit" data-id="${m.id}">Edit details</button><button data-action="membership" data-id="${m.id}">Add to collection</button>${m.type==="series"?`<button data-action="episodes" data-id="${m.id}">Track episodes</button>`:""}</div><button class="favorite ${m.favorite?"on":""}" data-action="favorite" data-id="${m.id}" title="Toggle favorite" aria-label="Toggle favorite">${m.favorite?"♥":"♡"}</button></div>`;
  }
  function card(m) {
    const progress = m.type==="series" ? seriesProgress(m.id) : null;
    return `<article class="poster-card">${poster(m)}<div class="poster-meta"><div class="poster-title" title="${esc(m.title)}">${esc(m.title)}</div><div class="poster-sub"><span>${esc(yearText(m))}</span><span class="status-text">${esc(statusLabel(m.status))}</span></div>${progress?`<div class="progress-track"><div style="width:${progress.percent}%"></div></div>`:""}</div></article>`;
  }
  function grid(items, limit) {
    const arr = typeof limit==="number" ? items.slice(0,limit) : items;
    if (!arr.length) return emptyState("Your library is waiting","Add a movie or series to start building your personal collection.",`<button class="btn btn-primary" data-action="add">＋ Add your first title</button>`);
    return `<div class="poster-grid">${arr.map(card).join("")}</div>`;
  }
  function emptyState(title, desc, action="") { return `<div class="empty-state"><div class="empty-icon">✦</div><h3>${esc(title)}</h3><p>${esc(desc)}</p>${action}</div>`; }
  function pageHead(kicker,title,desc,actions="") { return `<div class="page-heading"><div><p class="eyebrow">${esc(kicker)}</p><h1>${title}</h1><p>${esc(desc)}</p></div><div class="heading-actions">${actions}</div></div>`; }
  function statCard(label,value,note,icon) { return `<div class="stat-card"><div class="stat-top"><span>${esc(label)}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-note">${esc(note)}</div></div>`; }
  function counts() {
    const watched=state.media.filter(m=>m.status==="watched");
    const series=state.media.filter(m=>m.type==="series");
    const watchedEpisodes=state.progress.filter(p=>p.watched).length;
    const episodeCount=state.episodes.length;
    const runtime=watched.reduce((s,m)=>s+(Number(m.runtimeMinutes)||0),0);
    return {total:state.media.length,movies:state.media.filter(m=>m.type==="movie").length,series:series.length,watched:watched.length,planned:state.media.filter(m=>m.status==="planned").length,watching:state.media.filter(m=>m.status==="watching").length,watchedEpisodes,episodeCount,runtime};
  }
  function renderHome() {
    const c=counts(), recent=[...state.media].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
    return `<section class="hero"><div class="hero-copy"><div class="hero-kicker">YOUR PERSONAL SCREEN UNIVERSE</div><h1>Every story.<br><em>One library.</em></h1><p>Keep track of the films you love, the series you're following, and everything still on your watchlist. All private, all yours.</p><div class="hero-actions"><button class="btn btn-primary" data-action="add">＋ Add a title</button><button class="btn btn-quiet" data-view="discover">Explore discovery ✦</button></div></div></section>
      <div class="stats-grid">${statCard("Total titles",c.total,"Movies and series","▤")}${statCard("Watched",c.watched,"Marked as watched","✓")}${statCard("Want to watch",c.planned,"In your queue","◷")}${statCard("Episodes checked",c.watchedEpisodes,`${c.episodeCount} tracked episodes`,"▥")}</div>
      <div class="section-head"><h2>Recently added</h2><button class="text-link" data-view="library">View library →</button></div>${grid(recent,6)}
      <div class="section-head"><h2>Your collections</h2><button class="text-link" data-view="collections">All collections →</button></div>${renderCollectionCards(true)}
      <div class="section-head"><h2>Pick up where you left off</h2><button class="text-link" data-view="series">View series →</button></div>${grid(state.media.filter(m=>m.type==="series"&&m.status==="watching"),6)}`;
  }
  function renderLibrary(kind="all") {
    let items=matchingMedia(state.query);
    if(kind==="movies") items=items.filter(m=>m.type==="movie");
    if(kind==="series") items=items.filter(m=>m.type==="series");
    if(state.view==="collectionDetail" && state.activeCollection) {
      const ids=state.memberships.filter(x=>x.collectionId===state.activeCollection).map(x=>x.mediaId);
      items=items.filter(m=>ids.includes(m.id));
    }
    items=mediaMatchesFilters(items);
    const collection=state.collections.find(c=>c.id===state.activeCollection);
    const heading=collection?collection.name:(kind==="movies"?"Movies":kind==="series"?"TV series":"My library");
    const actions=`<button class="btn btn-primary" data-action="add">＋ Add title</button>`;
    return `${pageHead("YOUR WATCHLIST",esc(heading),collection?(collection.description||"A collection curated by you."):"Search, filter, and organize everything you want to watch or have watched.",actions)}
      <div class="toolbar"><input id="librarySearch" type="search" value="${esc(state.query)}" placeholder="Search titles…"><select id="filterType"><option value="all">All types</option><option value="movie" ${state.filters.type==="movie"?"selected":""}>Movies</option><option value="series" ${state.filters.type==="series"?"selected":""}>TV series</option></select><select id="filterStatus"><option value="all">All statuses</option>${["planned","watching","watched","on_hold","dropped"].map(s=>`<option value="${s}" ${state.filters.status===s?"selected":""}>${statusLabel(s)}</option>`).join("")}</select><select id="sortBy"><option value="added" ${state.filters.sort==="added"?"selected":""}>Recently added</option><option value="title" ${state.filters.sort==="title"?"selected":""}>Title A–Z</option><option value="year" ${state.filters.sort==="year"?"selected":""}>Newest year</option><option value="rating" ${state.filters.sort==="rating"?"selected":""}>IMDb rating</option><option value="personal" ${state.filters.sort==="personal"?"selected":""}>My rating</option></select><button class="btn btn-quiet" data-action="clearFilters">Clear filters</button></div>
      <div class="section-head"><h2>${items.length} ${items.length===1?"title":"titles"}</h2><span class="muted">Saved on this device</span></div>${grid(items)}`;
  }
  function collectionCount(id) { return state.memberships.filter(x=>x.collectionId===id).length; }
  function renderCollectionCards(compact=false) {
    if(!state.collections.length) return compact ? `<p class="muted">No collections yet. Make one for Marvel, DC, directors, actors, or any theme you like.</p>` : emptyState("Collections make it yours","Create your own shelves for Marvel, DC, Brad Pitt, directors, genres, or anything you want.",`<button class="btn btn-primary" data-action="newCollection">＋ Create collection</button>`);
    const cs=compact?state.collections.slice(0,3):state.collections;
    return `<div class="collection-grid">${cs.map(c=>`<article class="collection-card" data-action="openCollection" data-id="${c.id}" tabindex="0" role="button"><div><div class="collection-symbol">▦</div><h3>${esc(c.name)}</h3><p>${esc(c.description||"Your own curated shelf")}</p></div><div class="collection-bottom"><span>${collectionCount(c.id)} titles</span><span>Open collection ↗</span></div></article>`).join("")}</div>`;
  }
  function renderCollections() {
    return `${pageHead("YOUR CURATED SHELVES","Collections","Create collections for franchises, actors, directors, moods, or personal favorites.",`<button class="btn btn-primary" data-action="newCollection">＋ New collection</button>`)}${renderCollectionCards()}`;
  }
  function renderDiscover() {
    const eligible=state.media.filter(m=>m.type==="movie"&&m.year>=2001&&m.imdbRating!=null&&m.imdbRating>=7);
    const pending=state.media.filter(m=>m.type==="movie"&&m.year>=2001&&(m.imdbRating==null));
    return `${pageHead("FIND YOUR NEXT FAVORITE","Discovery desk","Start with titles you have saved. Later, connect a metadata provider or import a dataset to expand discovery.",`<button class="btn btn-primary" data-action="add">＋ Add a title</button>`)}
      <div class="notice warn"><b>Discovery is honest by design.</b> This first version does not pretend to have a complete live IMDb catalog. It checks your local library and can identify titles that match the release-year and rating rule. Use Add title to build your library; provider-backed discovery can be added when you configure a lawful data source.</div>
      <div class="stats-grid">${statCard("Qualifying saved movies",eligible.length,"Released 2001+ · IMDb ≥ 7.0","✦")}${statCard("Need rating",pending.length,"Release year 2001+","?")}${statCard("All saved movies",counts().movies,"Local movie records","▣")}${statCard("Data source","Local","No live IMDb feed configured","⌁")}</div>
      <div class="toolbar"><select id="discoverFilter"><option value="all">All saved movies</option><option value="qualifies" ${state.discoverFilter==="qualifies"?"selected":""}>Qualifies: 2001+ and IMDb ≥ 7.0</option><option value="pending" ${state.discoverFilter==="pending"?"selected":""}>Needs IMDb rating</option></select><span class="muted">IMDb rating is never replaced by another provider's score.</span></div>
      ${grid(state.media.filter(m=>m.type==="movie"&&(state.discoverFilter==="qualifies"?(m.year>=2001&&m.imdbRating!=null&&m.imdbRating>=7):state.discoverFilter==="pending"?(m.year>=2001&&m.imdbRating==null):true)).sort((a,b)=>(b.imdbRating||0)-(a.imdbRating||0)))}`;
  }
  function renderStats() {
    const c=counts(), watched=state.media.filter(m=>m.status==="watched"), genreCounts={};
    watched.forEach(m=>(m.genres||[]).forEach(g=>genreCounts[g]=(genreCounts[g]||0)+1));
    const genres=Object.entries(genreCounts).sort((a,b)=>b[1]-a[1]).slice(0,6), max=Math.max(1,...genres.map(x=>x[1]));
    const totalHours=Math.round(c.runtime/60);
    return `${pageHead("YOUR VIEWING HABITS","Statistics","A snapshot of the library you have built and the stories you've marked watched.")}
      <div class="stats-grid">${statCard("Total titles",c.total,"In your library","▤")}${statCard("Movies watched",watched.filter(m=>m.type==="movie").length,"Marked watched","▣")}${statCard("Series",c.series,"Tracked series","▥")}${statCard("Known watch time",totalHours?`${totalHours}h`:"—",totalHours?"Based on saved runtimes":"Add runtimes to calculate","◷")}</div>
      <div class="two-col"><section class="panel"><div class="section-head" style="margin-top:0"><h2>Watched by genre</h2></div>${genres.length?genres.map(([g,n])=>`<div class="bar-row"><span>${esc(g)}</span><div class="bar-track"><div class="bar-fill" style="width:${n/max*100}%"></div></div><b>${n}</b></div>`).join(""):`<p class="muted">Add genres and mark titles watched to see your genre breakdown.</p>`}</section>
      <section class="panel"><div class="section-head" style="margin-top:0"><h2>Library status</h2></div>${["watched","watching","planned","on_hold","dropped"].map(s=>{let n=state.media.filter(m=>m.status===s).length;return `<div class="bar-row"><span>${statusLabel(s)}</span><div class="bar-track"><div class="bar-fill" style="width:${c.total?n/c.total*100:0}%"></div></div><b>${n}</b></div>`}).join("")}<p class="muted">Statistics use only records saved in this browser.</p></section></div>`;
  }
  function renderSettings() {
    return `${pageHead("YOUR DATA, YOUR RULES","Settings & backup","Your library is stored locally in this browser. Export backups regularly, especially before clearing browser data.")}
      <div class="panel settings-panel">
        <div class="setting-row"><div><h3>Export full backup</h3><p>Download a versioned JSON backup containing titles, ratings, collections, watch status, seasons, and episode progress. API keys are not included.</p></div><button class="btn btn-primary" data-action="exportJson">Export JSON</button></div>
        <div class="setting-row"><div><h3>Export titles as CSV</h3><p>Download a spreadsheet-friendly list of titles, ratings, status, genres, and IDs.</p></div><button class="btn btn-quiet" data-action="exportCsv">Export CSV</button></div>
        <div class="setting-row"><div><h3>Import backup or CSV</h3><p>Preview the file and merge records. Duplicate IDs and matching IMDb IDs are detected; your existing personal notes and progress are preserved on merge.</p></div><div class="inline-actions"><button class="btn btn-quiet" data-action="importJson">Import JSON</button><button class="btn btn-quiet" data-action="importCsv">Import CSV</button><input type="file" id="importFile" accept=".json,application/json" hidden><input type="file" id="csvFile" accept=".csv,text/csv" hidden></div></div>
        <div class="setting-row"><div><h3>Metadata provider setup</h3><p>This local-only build does not call a movie API by default. A future provider connection should use a valid key and respect the provider's terms. Browser-stored keys are not secret.</p></div><span class="tag yellow">Not connected</span></div>
        <div class="setting-row"><div><h3>Storage status</h3><p>${state.media.length} titles · ${state.collections.length} collections · Data is saved in this browser's local storage in this MVP. Avoid very large poster URLs; IndexedDB is recommended for a production-scale library.</p></div><span class="tag green">On this device</span></div>
        <div class="setting-row"><div><h3>Delete all local data</h3><p>Permanently clear the library in this browser. Export a backup first if you want to keep it.</p></div><button class="btn btn-danger" data-action="clearData">Delete library</button></div>
      </div>`;
  }
  function render() {
    const titleMap={home:"Overview",library:"My library",movies:"Movies",series:"TV series",collections:"Collections",discover:"Discover",stats:"Statistics",settings:"Settings",collectionDetail:state.collections.find(c=>c.id===state.activeCollection)?.name||"Collection"};
    $("#pageTitle").textContent=titleMap[state.view]||"Overview";
    $$(".nav-item[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view || (state.view==="collectionDetail"&&b.dataset.view==="collections")));
    const content=$("#appContent");
    if(state.view==="home") content.innerHTML=renderHome();
    else if(state.view==="library") content.innerHTML=renderLibrary("all");
    else if(state.view==="movies") content.innerHTML=renderLibrary("movies");
    else if(state.view==="series") content.innerHTML=renderLibrary("series");
    else if(state.view==="collections") content.innerHTML=renderCollections();
    else if(state.view==="collectionDetail") content.innerHTML=renderLibrary("all");
    else if(state.view==="discover") content.innerHTML=renderDiscover();
    else if(state.view==="stats") content.innerHTML=renderStats();
    else if(state.view==="settings") content.innerHTML=renderSettings();
  }
  function navigate(view) { state.view=view; state.activeCollection=null; state.query=""; $("#globalSearch").value=""; render(); $("#sidebar").classList.remove("open"); $("#appContent").focus({preventScroll:true}); }
  function findDuplicate(data, excludeId=null) {
    const imdb=(data.imdbId||"").trim().toLowerCase();
    return state.media.find(m=>m.id!==excludeId&&m.type===data.type&&(
      (imdb && m.imdbId && m.imdbId.toLowerCase()===imdb) ||
      (m.title.trim().toLowerCase()===data.title.trim().toLowerCase() && Number(m.year||0)===Number(data.year||0))
    ));
  }
  function openMedia(id=null) {
    const m=id?getMedia(id):null;
    $("#mediaForm").reset(); $("#mediaId").value=m?.id||"";
    $("#mediaDialogTitle").textContent=m?"Edit title":"Add a title";
    $("#formEyebrow").textContent=m?"UPDATE YOUR LIBRARY":"YOUR LIBRARY";
    $("#titleInput").value=m?.title||""; $("#typeInput").value=m?.type||"movie"; $("#yearInput").value=m?.year??"";
    $("#imdbInput").value=m?.imdbRating??""; $("#rtCriticsInput").value=m?.rtCritics??""; $("#rtAudienceInput").value=m?.rtAudience??"";
    $("#metaInput").value=m?.metacritic??""; $("#personalInput").value=m?.personalRating??""; $("#statusInput").value=m?.status||"planned";
    $("#genresInput").value=(m?.genres||[]).join(", "); $("#posterInput").value=m?.posterUrl||""; $("#imdbIdInput").value=m?.imdbId||""; $("#notesInput").value=m?.notes||"";
    $("#mediaDialog").showModal(); $("#titleInput").focus();
  }
  $("#mediaForm").addEventListener("submit", e=>{
    e.preventDefault();
    const id=$("#mediaId").value;
    const data={title:$("#titleInput").value.trim(),type:$("#typeInput").value,year:num($("#yearInput").value),imdbRating:num($("#imdbInput").value),rtCritics:num($("#rtCriticsInput").value),rtAudience:num($("#rtAudienceInput").value),metacritic:num($("#metaInput").value),personalRating:num($("#personalInput").value),status:$("#statusInput").value,genres:$("#genresInput").value.split(",").map(x=>x.trim()).filter(Boolean),posterUrl:$("#posterInput").value.trim(),imdbId:$("#imdbIdInput").value.trim(),notes:$("#notesInput").value.trim()};
    if(!data.title) return;
    if(data.imdbRating!=null&&(data.imdbRating<0||data.imdbRating>10)) return toast("IMDb rating must be between 0 and 10.");
    const dup=findDuplicate(data,id||null);
    if(dup && !id) { const proceed=confirm(`Possible duplicate found: "${dup.title}" (${dup.year||"year unknown"}). Add another copy anyway?`); if(!proceed){$("#mediaDialog").close();return;} }
    if(id) {
      const old=getMedia(id); Object.assign(old,data,{updatedAt:now()});
      if(data.status==="watched"&&!old.watchedAt) old.watchedAt=now();
    } else {
      const item={id:uid(),...data,originalTitle:"",favorite:false,createdAt:now(),updatedAt:now(),watchedAt:data.status==="watched"?now():null};
      state.media.push(item);
    }
    persist(); $("#mediaDialog").close(); render(); toast(id?"Title updated":"Title added to your library");
  });
  function openCollection(id=null) {
    const c=id?state.collections.find(x=>x.id===id):null; $("#collectionForm").reset(); $("#collectionId").value=c?.id||"";
    $("#collectionDialogTitle").textContent=c?"Edit collection":"New collection"; $("#collectionName").value=c?.name||""; $("#collectionDescription").value=c?.description||"";
    $("#collectionDialog").showModal();
  }
  $("#collectionForm").addEventListener("submit",e=>{
    e.preventDefault(); const id=$("#collectionId").value, name=$("#collectionName").value.trim(), description=$("#collectionDescription").value.trim();
    if(!name)return;
    if(state.collections.some(c=>c.name.toLowerCase()===name.toLowerCase()&&c.id!==id))return toast("A collection with that name already exists.");
    if(id) Object.assign(state.collections.find(c=>c.id===id),{name,description,updatedAt:now()});
    else state.collections.push({id:uid(),name,description,createdAt:now(),updatedAt:now()});
    persist(); $("#collectionDialog").close(); render(); toast(id?"Collection updated":"Collection created");
  });
  function openMembership(mediaId) {
    const m=getMedia(mediaId); if(!m)return;
    $("#membershipMediaId").value=mediaId; $("#membershipTitle").textContent=m.title;
    const current=new Set(state.memberships.filter(x=>x.mediaId===mediaId).map(x=>x.collectionId));
    $("#membershipChoices").innerHTML=state.collections.length?state.collections.map(c=>`<label class="check-row"><input type="checkbox" value="${c.id}" ${current.has(c.id)?"checked":""}><span>${esc(c.name)}</span><span class="muted" style="margin-left:auto">${collectionCount(c.id)} titles</span></label>`).join(""):`<p class="muted">No collections yet. Create a collection first.</p><button type="button" class="btn btn-quiet" data-action="newCollection">＋ Create collection</button>`;
    $("#membershipDialog").showModal();
  }
  $("#membershipForm").addEventListener("submit",e=>{
    e.preventDefault(); const mediaId=$("#membershipMediaId").value;
    const chosen=new Set($$("#membershipChoices input[type=checkbox]:checked").map(x=>x.value));
    state.memberships=state.memberships.filter(x=>x.mediaId!==mediaId||chosen.has(x.collectionId));
    for(const collectionId of chosen) if(!state.memberships.some(x=>x.mediaId===mediaId&&x.collectionId===collectionId)) state.memberships.push({mediaId,collectionId,createdAt:now()});
    persist(); $("#membershipDialog").close(); render(); toast("Collection memberships saved");
  });
  function seriesProgress(mediaId) {
    const seasons=state.seasons.filter(s=>s.mediaId===mediaId), eps=state.episodes.filter(e=>e.mediaId===mediaId);
    const watched=eps.filter(e=>state.progress.some(p=>p.episodeId===e.id&&p.watched)).length;
    return {total:eps.length,watched,percent:eps.length?Math.round(watched/eps.length*100):0,seasons:seasons.length};
  }
  function openEpisodes(mediaId) {
    const m=getMedia(mediaId); if(!m)return;
    $("#episodeMediaId").value=mediaId; $("#episodeTitle").textContent=m.title+" · Episodes"; renderEpisodeList(mediaId); $("#episodeDialog").showModal();
  }
  function renderEpisodeList(mediaId) {
    const seasons=state.seasons.filter(s=>s.mediaId===mediaId).sort((a,b)=>a.number-b.number);
    if(!seasons.length){$("#episodeList").innerHTML=`<p class="muted">No seasons added yet. Add a season below to create episode checkboxes.</p>`;return;}
    $("#episodeList").innerHTML=seasons.map(s=>{
      const eps=state.episodes.filter(e=>e.seasonId===s.id).sort((a,b)=>a.number-b.number), done=eps.filter(e=>state.progress.some(p=>p.episodeId===e.id&&p.watched)).length;
      return `<section class="episode-season"><div class="season-head"><span>Season ${s.number} · ${done}/${eps.length} watched</span><button class="tiny-btn" data-action="seasonWatched" data-id="${s.id}">Mark all watched</button></div>${eps.map(ep=>{const watched=state.progress.some(p=>p.episodeId===ep.id&&p.watched);return `<label class="episode-row ${watched?"done":""}"><input type="checkbox" data-episode="${ep.id}" ${watched?"checked":""}><span class="episode-name">E${String(ep.number).padStart(2,"0")} · ${esc(ep.title||"Episode "+ep.number)}</span></label>`}).join("")}</section>`;
    }).join("");
  }
  $("#addSeasonBtn").addEventListener("click",()=>{
    const mediaId=$("#episodeMediaId").value, number=num($("#seasonNumber").value), count=num($("#episodeCount").value);
    if(number==null||count==null||count<1||count>100)return toast("Enter a valid season number and episode count.");
    if(state.seasons.some(s=>s.mediaId===mediaId&&s.number===number))return toast("That season already exists.");
    const season={id:uid(),mediaId,number,createdAt:now()}; state.seasons.push(season);
    for(let i=1;i<=count;i++)state.episodes.push({id:uid(),mediaId,seasonId:season.id,number:i,title:"",createdAt:now()});
    persist(); renderEpisodeList(mediaId); render(); toast(`Season ${number} added`);
  });
  function setEpisode(episodeId, watched) {
    const existing=state.progress.find(p=>p.episodeId===episodeId);
    if(existing) Object.assign(existing,{watched,watchedAt:watched?now():null,updatedAt:now()});
    else state.progress.push({id:uid(),episodeId,watched,watchedAt:watched?now():null,updatedAt:now()});
    persist();
  }
  function exportFile(filename,content,type) {
    const blob=new Blob([content],{type}), url=URL.createObjectURL(blob), a=document.createElement("a");
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function backupObject() { return {app:"CineTrack",version:1,exportedAt:now(),media:state.media,collections:state.collections,memberships:state.memberships,seasons:state.seasons,episodes:state.episodes,progress:state.progress}; }
  function exportJson() { exportFile(`cinetrack-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(backupObject(),null,2),"application/json");toast("JSON backup downloaded"); }
  function csvCell(v) { const s=Array.isArray(v)?v.join("|"):v==null?"":String(v);return `"${s.replace(/"/g,'""')}"`; }
  function exportCsv() {
    const cols=["id","title","type","year","imdbRating","rtCritics","rtAudience","metacritic","personalRating","status","genres","posterUrl","imdbId","favorite","notes","createdAt","updatedAt"];
    const rows=[cols.join(","),...state.media.map(m=>cols.map(k=>csvCell(m[k])).join(","))];
    exportFile(`cinetrack-titles-${new Date().toISOString().slice(0,10)}.csv`,rows.join("\r\n"),"text/csv;charset=utf-8");toast("CSV downloaded");
  }
  function parseCSV(text) {
    const rows=[]; let row=[], field="", quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(quoted){if(c==='"'&&n==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"')quoted=true;else if(c===","){row.push(field);field="";}else if(c==="\n"){row.push(field);rows.push(row);row=[];field="";}else if(c!=="\r")field+=c;}
    if(field.length||row.length){row.push(field);rows.push(row);} if(!rows.length)return [];
    const headers=rows.shift().map(h=>h.trim());return rows.filter(r=>r.some(x=>x.trim())).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??""])));
  }
  function safeMedia(raw) {
    const type=raw.type==="series"?"series":"movie", title=String(raw.title||"").trim();
    if(!title)return null;
    const imdb=num(raw.imdbRating), year=num(raw.year);
    return {id:String(raw.id||uid()),title,type,year,imdbRating:imdb!=null&&imdb>=0&&imdb<=10?imdb:null,rtCritics:num(raw.rtCritics),rtAudience:num(raw.rtAudience),metacritic:num(raw.metacritic),personalRating:num(raw.personalRating),status:["planned","watching","watched","on_hold","dropped"].includes(raw.status)?raw.status:"planned",genres:Array.isArray(raw.genres)?raw.genres.map(String):String(raw.genres||"").split("|").map(x=>x.trim()).filter(Boolean),posterUrl:String(raw.posterUrl||""),imdbId:String(raw.imdbId||""),favorite:raw.favorite===true||raw.favorite==="true",notes:String(raw.notes||""),originalTitle:String(raw.originalTitle||""),runtimeMinutes:num(raw.runtimeMinutes),watchedAt:raw.watchedAt||null,createdAt:raw.createdAt||now(),updatedAt:now()};
  }
  function importJsonFile(file) {
    const reader=new FileReader(); reader.onload=()=>{
      let data;try{data=JSON.parse(reader.result);}catch{return toast("That file is not valid JSON.");}
      if(!data||!Array.isArray(data.media))return toast("This backup does not contain a valid media list.");
      if(data.version>1&&!confirm("This backup uses a newer format version. Try importing compatible fields?"))return;
      const incoming=data.media.map(safeMedia).filter(Boolean);
      const duplicateCount=incoming.filter(m=>findDuplicate(m)||state.media.some(x=>x.id===m.id)).length;
      const message=`Import preview:\n• ${incoming.length} valid titles\n• ${duplicateCount} possible existing matches\n• ${Array.isArray(data.collections)?data.collections.length:0} collections\n\nMerge into this library? Existing titles will keep their local notes and progress unless missing.`;
      if(!confirm(message))return;
      let added=0, merged=0;
      const idMap=new Map();
      for(const item of incoming){
        const byId=state.media.find(x=>x.id===item.id), dup=byId||findDuplicate(item);
        if(dup){const oldId=dup.id;idMap.set(item.id,oldId);for(const [k,v] of Object.entries(item))if((dup[k]==null||dup[k]===""||(Array.isArray(dup[k])&&!dup[k].length))&&v!=null)dup[k]=v;merged++;}
        else {state.media.push(item);idMap.set(item.id,item.id);added++;}
      }
      const colMap=new Map();
      for(const c of (Array.isArray(data.collections)?data.collections:[])){
        let local=state.collections.find(x=>x.id===c.id)||state.collections.find(x=>x.name.toLowerCase()===String(c.name||"").toLowerCase());
        if(!local){local={id:c.id||uid(),name:String(c.name||"Imported collection"),description:String(c.description||""),createdAt:c.createdAt||now(),updatedAt:now()};state.collections.push(local);}
        colMap.set(c.id,local.id);
      }
      for(const rel of (data.memberships||[])){const mediaId=idMap.get(rel.mediaId)||rel.mediaId, collectionId=colMap.get(rel.collectionId)||rel.collectionId;if(getMedia(mediaId)&&state.collections.some(c=>c.id===collectionId)&&!state.memberships.some(x=>x.mediaId===mediaId&&x.collectionId===collectionId))state.memberships.push({mediaId,collectionId,createdAt:rel.createdAt||now()});}
      for(const s of (data.seasons||[])){const mediaId=idMap.get(s.mediaId)||s.mediaId;if(getMedia(mediaId)&&!state.seasons.some(x=>x.id===s.id))state.seasons.push({...s,mediaId});}
      for(const ep of (data.episodes||[])){const mediaId=idMap.get(ep.mediaId)||ep.mediaId;if(getMedia(mediaId)&&!state.episodes.some(x=>x.id===ep.id))state.episodes.push({...ep,mediaId});}
      for(const p of (data.progress||[]))if(!state.progress.some(x=>x.episodeId===p.episodeId))state.progress.push(p);
      persist();render();toast(`Import complete: ${added} added, ${merged} merged.`);
    };reader.readAsText(file);
  }
  function importCsvFile(file) {
    const reader=new FileReader();reader.onload=()=>{
      let rows;try{rows=parseCSV(String(reader.result||""));}catch{return toast("Could not parse CSV.");}
      if(!rows.length)return toast("CSV appears empty.");
      const incoming=rows.map(safeMedia).filter(Boolean), dups=incoming.filter(m=>findDuplicate(m)||state.media.some(x=>x.id===m.id)).length;
      if(!confirm(`CSV import preview:\n• ${incoming.length} valid titles\n• ${dups} possible duplicates\n\nMerge these titles into your library?`))return;
      let added=0,merged=0;
      for(const item of incoming){const old=state.media.find(x=>x.id===item.id)||findDuplicate(item);if(old){for(const [k,v] of Object.entries(item))if((old[k]==null||old[k]===""||(Array.isArray(old[k])&&!old[k].length))&&v!=null)old[k]=v;merged++;}else{state.media.push(item);added++;}}
      persist();render();toast(`CSV imported: ${added} added, ${merged} merged.`);
    };reader.readAsText(file);
  }
  function action(action,id) {
    const m=id?getMedia(id):null;
    if(action==="add")openMedia();
    else if(action==="edit")openMedia(id);
    else if(action==="favorite"&&m){m.favorite=!m.favorite;m.updatedAt=now();persist();render();}
    else if(action==="membership")openMembership(id);
    else if(action==="newCollection")openCollection();
    else if(action==="openCollection"){state.view="collectionDetail";state.activeCollection=id;state.query="";render();}
    else if(action==="editCollection")openCollection(id);
    else if(action==="deleteCollection"){const c=state.collections.find(x=>x.id===id);if(c&&confirm(`Delete collection "${c.name}"? Titles will remain in your library.`)){state.collections=state.collections.filter(x=>x.id!==id);state.memberships=state.memberships.filter(x=>x.collectionId!==id);persist();render();toast("Collection deleted");}}
    else if(action==="episodes")openEpisodes(id);
    else if(action==="seasonWatched"){const eps=state.episodes.filter(e=>e.seasonId===id);const all=eps.every(e=>state.progress.some(p=>p.episodeId===e.id&&p.watched));eps.forEach(e=>setEpisode(e.id,!all));renderEpisodeList($("#episodeMediaId").value);render();}
    else if(action==="clearFilters"){state.query="";state.filters={type:"all",status:"all",sort:"added"};render();}
    else if(action==="exportJson")exportJson();
    else if(action==="exportCsv")exportCsv();
    else if(action==="importJson")$("#importFile").click();
    else if(action==="importCsv")$("#csvFile").click();
    else if(action==="clearData"){if(confirm("Delete ALL CineTrack data saved in this browser? This cannot be undone. Export a backup first if needed.")&&confirm("Last confirmation: permanently delete the library?")){for(const k of ["media","collections","memberships","seasons","episodes","progress"])state[k]=[];persist();render();toast("Local library deleted");}}
  }
  document.addEventListener("click",e=>{
    const close=e.target.closest("[data-close]");if(close){$("#"+close.dataset.close).close();return;}
    const nav=e.target.closest("[data-view]");if(nav){navigate(nav.dataset.view);return;}
    const btn=e.target.closest("[data-action]");if(btn){action(btn.dataset.action,btn.dataset.id);return;}
  });
  document.addEventListener("keydown",e=>{
    const card=e.target.closest(".collection-card");
    if(card&&(e.key==="Enter"||e.key===" ")){e.preventDefault();action("openCollection",card.dataset.id);}
  });
  $("#globalSearch").addEventListener("input",e=>{state.query=e.target.value;if(state.view==="home"&&state.query)state.view="library";render();const local=$("#librarySearch");if(local){local.value=state.query;local.focus({preventScroll:true});}});
  $("#appContent").addEventListener("input",e=>{
    if(e.target.id==="librarySearch"){state.query=e.target.value;const pos=e.target.selectionStart;render();const next=$("#librarySearch");if(next){next.focus({preventScroll:true});next.setSelectionRange(pos,pos);}}
    if(e.target.matches("[data-episode]")){setEpisode(e.target.dataset.episode,e.target.checked);e.target.closest(".episode-row").classList.toggle("done",e.target.checked);render();renderEpisodeList($("#episodeMediaId").value);}
  });
  $("#appContent").addEventListener("change",e=>{
    if(e.target.id==="filterType"){state.filters.type=e.target.value;render();}
    if(e.target.id==="filterStatus"){state.filters.status=e.target.value;render();}
    if(e.target.id==="sortBy"){state.filters.sort=e.target.value;render();}
    if(e.target.id==="discoverFilter"){state.discoverFilter=e.target.value;render();}
  });
  $("#mobileMenu").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
  $("#addMediaBtn").addEventListener("click",()=>openMedia());
  $("#importFile").addEventListener("change",e=>{if(e.target.files[0])importJsonFile(e.target.files[0]);e.target.value="";});
  $("#csvFile").addEventListener("change",e=>{if(e.target.files[0])importCsvFile(e.target.files[0]);e.target.value="";});
  window.addEventListener("online",()=>toast("You're back online."));
  window.addEventListener("offline",()=>toast("Offline: your saved library is still available."));
  load();render();
  if("serviceWorker" in navigator && location.protocol!=="file:") window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
})();