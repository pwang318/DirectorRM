(() => {
  const root = document.getElementById('coreTeamSync');
  const find = selector => root.querySelector(selector);
  const status = find('[data-sync-status]');
  const source = find('[data-sync-sources]');
  const account = find('[data-sync-account]');
  const authenticated = find('[data-sync-authenticated]');
  const isDirector = root.dataset.surface === 'director';
  const collections = {
    'director-huddle': ['director-core-2027-huddle', 'Director huddles and actions'],
    'director-execution': ['director-core-execution-v1', 'Director production, Rockford, and audits'],
    'director-forecast': ['director-funding-forecast-v1', 'Director funding forecast'],
    'director-comp-pacing': ['director-comp-pacing-v1', 'Director weekly compensation figures'],
    'rm-weekly': ['rm-core-weekly-review-v1', 'RM weekly review and follow-ups']
  };
  const allowed = isDirector ? Object.keys(collections) : ['rm-weekly'];
  if (!window.supabase?.createClient) {
    status.textContent = 'Could not load team sign-in. Refresh to retry.';
    return;
  }
  const api = window.supabase.createClient(isDirector ? DIRECTOR_RM_URL : SB_URL, isDirector ? DIRECTOR_RM_KEY : SB_KEY,
    {auth:{storageKey:'core-tracker-team-auth-v1', detectSessionInUrl:true}});
  const snapshots = new Map();
  const loadedRevisions = new Map();
  let sessionId = null;
  let busy = false;
  let timer;
  const dateKey = () => new Intl.DateTimeFormat('en-CA', {
    timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit'
  }).format(new Date());
  const dateTime = value => value ? new Date(value).toLocaleString('en-US', {timeZone:'America/New_York'}) + ' ET' : 'Unavailable';
  const old = (value, today, days) => !value || Date.parse(today) -
    Date.parse(new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date(value))) > days * 86400000;

  function addLine(list, text) {
    const line = document.createElement('li');
    line.textContent = text;
    list.append(line);
  }
  const reviewStatus = find('[data-huddle-review-status]');
  const reviewHost = find('[data-huddle-review]');
  const huddleKey = 'director-core-2027-huddle';
  let reviewReport;
  function readHuddle() {
    return JSON.parse(localStorage.getItem(huddleKey) || 'null') || {snapshots:{}, actions:[]};
  }
  function saveHuddle(state, message) {
    localStorage.setItem(huddleKey, JSON.stringify(state));
    window.dispatchEvent(new Event('director-core-huddle-imported'));
    renderReview();
    reviewStatus.textContent = message;
  }
  function renderReview() {
    if (!reviewHost || !reviewReport) return;
    const {date, fundingExceptions, slipped, accountsReady} = reviewReport;
    const rm = snapshots.get('rm-weekly');
    const week = new Date(date + 'T00:00:00Z');
    week.setUTCDate(week.getUTCDate() - (week.getUTCDay() + 6) % 7);
    const weekKey = week.toISOString().slice(0, 10);
    const issues = [
      ...fundingExceptions.map(row => ({
        key:'funding:' + row.reference, owner:row.owner || 'Director',
        action:'Verify funding evidence in Encompass for ' + row.reference + ' (' + row.milestone + '). Confirm the funded date or document why it stays excluded.'
      })),
      ...slipped.map(row => ({
        key:'date:' + row.reference + ':' + row.estimatedDate, owner:row.owner || 'Director',
        action:'Confirm the new expected funding date or blocker for ' + row.reference + ' (previously ' + row.estimatedDate + ').'
      })),
      {key:'intake:' + date, owner:'Mackenzie',
       action:'Reconcile deduplicated CRM leads across all six relationship sources and verify all-source 1003 starts against the dated Encompass report.'},
      {key:'comp:' + weekKey, owner:'Director',
       action:'Verify Channel, A-level including Channel, B-or-higher, active partners, and productivity from official totals. For productivity, record quarter leads and all three month-end active counts.'},
      {key:'rm:' + weekKey, owner:'Amanda and Director',
       action:'Verify the RM handoff across two accounts. Confirm a published follow-up has an owner, due date, and next action.',
       blocked:accountsReady < 2 || !rm?.revision}
    ];
    const saved = readHuddle().actions.filter(entry => entry.reconciliationKey);
    const byKey = new Map(saved.map(entry => [entry.reconciliationKey, entry]));
    for (const entry of saved) {
      if (!entry.checked && !issues.some(issue => issue.key === entry.reconciliationKey)) {
        issues.push({key:entry.reconciliationKey, owner:entry.owner, action:entry.action,
          blocked:entry.reconciliationKey.startsWith('rm:') && (accountsReady < 2 || !rm?.revision)});
      }
    }
    reviewHost.replaceChildren();
    reviewStatus.textContent = fundingExceptions.length + ' funding exceptions · ' + slipped.length + ' slipped files · ' +
      accountsReady + ' approved sign-ins confirmed · ' + (rm?.revision ? 'RM shared version ' + rm.revision : 'RM handoff unpublished');
    for (const issue of issues) {
      const entry = byKey.get(issue.key);
      const item = document.createElement('li');
      item.textContent = issue.action + ' · ' + (entry?.owner || issue.owner) + ' ';
      const form = document.createElement('form');
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.required = true;
      const button = document.createElement('button');
      button.type = 'submit';
      button.className = 'btn';
      if (entry?.checked && entry.evidence) {
        item.append('Verified · ' + entry.evidence);
      } else {
        if (entry) {
          item.append('Due ' + entry.due.replace('T', ' ') + ' ET. ');
          label.textContent = 'Verification result or report reference ';
          input.maxLength = 240;
          button.textContent = 'Save verification';
          if (issue.blocked) {
            button.disabled = true;
            item.append('A second confirmed account and a published RM version are needed. ');
          }
        } else {
          label.textContent = 'Due time (Eastern) ';
          input.type = 'datetime-local';
          button.textContent = 'Add to huddle';
        }
        label.append(input);
        form.append(label, button);
        item.append(form);
        form.onsubmit = event => {
          event.preventDefault();
          const value = input.value.trim();
          if (!value) return;
          try {
            const latest = readHuddle();
            const existing = latest.actions.find(row => row.reconciliationKey === issue.key);
            if (!entry && !existing) {
              latest.actions.push({
                id:crypto.randomUUID(), reconciliationKey:issue.key, action:issue.action,
                owner:issue.owner, due:value
              });
              saveHuddle(latest, 'Added to the huddle. Publish the huddle to share this task.');
            } else if (entry && existing && !existing.checked && !issue.blocked) {
              existing.evidence = issue.key.startsWith('rm:') ? 'RM shared version ' + rm.revision + ' · ' + value : value;
              existing.checked = new Date().toISOString();
              saveHuddle(latest, 'Verification recorded. Publish the huddle to share it.');
            } else {
              renderReview();
            }
          } catch {
            reviewStatus.textContent = 'Could not save the reconciliation record.';
          }
        };
      }
      reviewHost.append(item);
    }
  }
  async function refreshReview(requestSession) {
    if (!reviewHost) return;
    const {data, error} = await api.rpc('core_tracker_huddle_review');
    if (sessionId !== requestSession) return;
    try {
      if (error || !data) throw Error();
      reviewReport = data;
      renderReview();
    } catch {
      reviewReport = null;
      reviewHost.replaceChildren();
      reviewStatus.textContent = 'Huddle reconciliation unavailable. Retry after refreshing shared records.';
    }
  }
  async function refreshSources() {
    if (!source || !sessionId) return;
    const requestSession = sessionId;
    const asOf = dateKey();
    const {data, error} = await api.rpc('core_tracker_source_report', {p_as_of:asOf});
    if (sessionId !== requestSession) return;
    source.replaceChildren();
    if (error || !data) {
      addLine(source, 'Source verification unavailable. Check team access or retry.');
      return;
    }
    const importLabel = (label, run) => label + ': ' + dateTime(run?.imported_at) +
      (run ? ' · ' + run.status + (old(run.imported_at, asOf, 7) ? ' · stale' : '') : '');
    addLine(source, 'Sources checked ' + dateTime(new Date()) + ' · reporting date ' + data.asOf);
    addLine(source, importLabel('Encompass pipeline', data.pipelineImport));
    addLine(source, importLabel('Encompass funded units', data.fundedImport));
    addLine(source, data.yearFunded + ' YTD verified fundings in the loan table' +
      (data.fundedImport?.status !== 'ok' ? ' · the import is incomplete; reconcile before using as the official total.' : '.'));
    if (data.pipelineImport) {
      addLine(source, data.forecast.map(row => row.days + ' days: ' + row.scheduled + ' scheduled').join(' · ') +
        ' · ' + data.slipped + ' active files past their estimated date. Scheduled counts need review before use as expected fundings.');
    }
    const latest = data.crm?.latest;
    addLine(source, 'CRM quarter feed: ' + (latest ? data.crm.unique_keys + ' distinct keyed leads through ' + latest +
      (Date.parse(asOf) - Date.parse(latest) > 7 * 86400000 ? ' · stale' : '') : 'No dated records') +
      '. Categories in the feed: ' + (data.crm?.categories?.filter(Boolean).join(', ') || 'none') +
      '. Full relationship intake and all-source file starts remain unverified.');
    addLine(source, 'Power BI receipt: ' + dateTime(data.powerBiReceipt) +
      (old(data.powerBiReceipt, asOf, 7) ? ' · stale or missing' : '') + '. Verify the five compensation inputs separately.');
  }
  async function loadCollection(collection) {
    const {data, error} = await api.from('core_tracker_shared_state')
      .select('collection,payload,revision,updated_at').eq('collection',collection).maybeSingle();
    if (error) throw error;
    const snapshot = data || {revision:0, payload:null};
    snapshots.set(collection, snapshot);
    return snapshot;
  }
  function updateLocal(collection, payload) {
    localStorage.setItem(collections[collection][0], JSON.stringify(payload));
    window.dispatchEvent(new Event('core-team-sync-updated'));
    if (collection === 'director-huddle') {
      window.dispatchEvent(new Event('director-core-huddle-imported'));
      renderReview();
    }
  }
  function renderCollections() {
    const list = find('[data-sync-collections]');
    list.replaceChildren();
    for (const collection of allowed) {
      const [,label] = collections[collection];
      const snapshot = snapshots.get(collection);
      const item = document.createElement('li');
      item.textContent = label + (snapshot?.updated_at ? ' · shared version ' + snapshot.revision + ' · ' + dateTime(snapshot.updated_at) :
        snapshot ? ' · no shared record yet' : ' · refresh required') + ' ';
      for (const [operation, buttonText] of [['pull','Load shared'], ['push','Publish browser records']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = isDirector ? 'btn' : 'btn-sm';
        button.textContent = buttonText;
        button.disabled = !snapshot || (operation === 'pull' && snapshot.revision === 0);
        button.onclick = () => void transfer(collection, operation);
        item.append(button, ' ');
      }
      list.append(item);
    }
  }
  async function transfer(collection, operation) {
    if (busy || !sessionId || !snapshots.has(collection)) return;
    const transferSession = sessionId;
    busy = true;
    try {
      const key = collections[collection][0];
      const local = JSON.parse(localStorage.getItem(key) || 'null');
      if (operation === 'pull') {
        const latest = await loadCollection(collection);
        if (sessionId !== transferSession || !latest.revision) return;
        if (local !== null && JSON.stringify(local) !== JSON.stringify(latest.payload) &&
          !window.confirm('Replace this browser’s records in this section with the shared version?')) return;
        updateLocal(collection, latest.payload);
        loadedRevisions.set(collection, latest.revision);
        status.textContent = 'Shared version loaded into this browser.';
      } else {
        if (local === null) throw Error('There are no browser records to publish.');
        const revision = snapshots.get(collection).revision;
        if (revision && loadedRevisions.get(collection) !== revision) {
          throw Error('Load the latest shared version before editing or publishing this section.');
        }
        if (!window.confirm('Publish this browser’s records in this section as the next shared version?')) return;
        const {error} = await api.rpc('core_tracker_save_state', {
          p_collection:collection, p_payload:local, p_revision:snapshots.get(collection).revision
        });
        if (error?.code === '40001') {
          await loadCollection(collection);
          renderCollections();
          throw Error('A teammate changed this section. Your browser records were preserved. Compare the shared version before publishing again.');
        }
        if (error) throw error;
        if (sessionId !== transferSession) return;
        await loadCollection(collection);
        loadedRevisions.set(collection, revision + 1);
        status.textContent = 'Published a new shared version.';
      }
      renderCollections();
    } catch (error) {
      status.textContent = error.message || 'Could not sync this section.';
    } finally {
      busy = false;
    }
  }
  async function refresh() {
    if (!sessionId || busy) return;
    busy = true;
    try {
      await Promise.all(allowed.map(loadCollection));
      renderCollections();
      await Promise.all([refreshSources(), refreshReview(sessionId)]);
    } catch {
      status.textContent = 'Could not refresh shared records.';
    } finally {
      busy = false;
    }
  }
  async function showSession(session) {
    clearInterval(timer);
    snapshots.clear();
    loadedRevisions.clear();
    sessionId = null;
    authenticated.hidden = true;
    account.hidden = false;
    source?.replaceChildren();
    reviewHost?.replaceChildren();
    reviewReport = null;
    if (!session?.user?.email) {
      status.textContent = 'Sign in with your approved Core Team account.';
      return;
    }
    const {data, error} = await api.from('agent_email_team_members').select('added_at').limit(1).maybeSingle();
    if (error || !data) {
      status.textContent = 'This account does not have approved Core Team access.';
      return;
    }
    sessionId = session.user.id;
    authenticated.hidden = false;
    account.hidden = true;
    status.textContent = 'Signed in to Core Team sync.';
    renderCollections();
    await refresh();
    timer = setInterval(() => { void refreshSources(); }, 5 * 60 * 1000);
  }
  account.addEventListener('submit', async event => {
    event.preventDefault();
    const email = account.elements.email.value.trim();
    const password = account.elements.password.value;
    const result = password ? await api.auth.signInWithPassword({email,password}) :
      await api.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:location.origin + location.pathname}});
    account.elements.password.value = '';
    status.textContent = result.error ? 'Sign-in unavailable for this account. Check account access or retry.' :
      password ? 'Checking team access…' : 'Check your email for a sign-in link.';
  });
  find('[data-sync-refresh]').onclick = () => void refresh();
  find('[data-sync-logout]').onclick = () => void api.auth.signOut();
  api.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' && sessionId === session?.user?.id) return;
    setTimeout(() => { void showSession(session); }, 0);
  });
})();
