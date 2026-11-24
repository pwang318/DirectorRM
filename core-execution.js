(() => {
  const panel = document.getElementById('directorCoreExecution');
  const find = selector => panel.querySelector(selector);
  const production = find('[data-core-form=production]');
  const rockford = find('[data-core-form=rockford]');
  const audit = find('[data-core-form=audit]');
  const status = find('[data-core-status]');
  const key = 'director-core-execution-v1';
  const huddleKey = 'director-core-2027-huddle';
  const quarters = [80, 120, 120, 80].map((target, index) => ['q' + (index + 1), 'Q' + (index + 1), target]);
  const sources = [
    ['realtor', 'Realtor', 192], ['rockford', 'Rockford', 60],
    ['current', 'Current-client referrals', 30], ['past', 'Past-client referrals', 30],
    ['returning', 'Returning past clients', 40], ['friends', 'Personal-friend referrals', 33],
    ['advertising', 'Advertising', 15]
  ];
  const stages = [
    ['leads', 'YTD relationship leads', 2200], ['starts', 'YTD all-source 1003 starts', 1800],
    ['approvals', 'YTD pre-approval events'], ['contracts', 'YTD contract events'],
    ['referred', 'YTD referred leads'], ['referredStarts', 'YTD 1003s from referred leads']
  ];
  const introductions = [['currentIntros', 'Current-client introductions', 10], ['pastIntros', 'Past-client introductions', 10]];
  const fields = [...quarters, ...sources, ...stages, ...introductions];

  function renderFields() {
    const host = find('[data-core-production-fields]');
    for (const [title, rows] of [
      ['Fundings by quarter', quarters], ['YTD fundings by source', sources],
      ['Intake and conversion', stages], ['Introductions in the reporting month', introductions]
    ]) {
      const heading = document.createElement('h4');
      heading.textContent = title;
      const grid = document.createElement('div');
      grid.className = 'grid two';
      for (const [name, label, target] of rows) {
        const field = document.createElement('div');
        field.className = 'field';
        const input = document.createElement('input');
        input.id = 'core-production-' + name;
        input.name = name;
        input.type = 'number';
        input.min = '0';
        input.step = '1';
        const caption = document.createElement('label');
        caption.htmlFor = input.id;
        caption.textContent = label + (target === undefined ? '' : ' / ' + target);
        field.append(caption, input);
        grid.append(field);
      }
      host.append(heading, grid);
    }
  }
  function read(storageKey, empty) {
    return JSON.parse(localStorage.getItem(storageKey) || 'null') || empty;
  }
  const readExecution = () => read(key, {production: {}, rockford: {}, audits: []});
  const readHuddle = () => read(huddleKey, {snapshots: {}, actions: []});
  const count = input => Number.isSafeInteger(input.valueAsNumber) && input.valueAsNumber >= 0 ? input.valueAsNumber : null;
  function results() {
    const counts = Object.fromEntries(fields.map(([name]) => [name, count(production.elements[name])]));
    const funding = quarters.every(([name]) => counts[name] !== null) ?
      quarters.reduce((sum, [name]) => sum + counts[name], 0) : null;
    const sourced = sources.every(([name]) => counts[name] !== null) ?
      sources.reduce((sum, [name]) => sum + counts[name], 0) : null;
    const rate = (numerator, denominator) => numerator !== null && denominator > 0 ?
      (100 * numerator / denominator).toFixed(1) + '%' : '—';
    find('[data-core-production-result]').textContent = [
      'Funded ' + (funding ?? '—') + ' / 400',
      'Source totals ' + (sourced ?? '—') + (funding !== null && sourced !== null && funding !== sourced ? ' (reconcile against quarterly fundings)' : ''),
      'Start to pre-approval ' + rate(counts.approvals, counts.starts) + ' / 55%',
      'Pre-approval to contract ' + rate(counts.contracts, counts.approvals) + ' / 65%',
      'Contract to funding ' + rate(funding, counts.contracts) + ' / 75%',
      'Referred lead to 1003 ' + rate(counts.referredStarts, counts.referred) + ' / 80%+'
    ].join(' · ');
    return counts;
  }
  function save(change, message) {
    try {
      const data = readExecution();
      change(data);
      localStorage.setItem(key, JSON.stringify(data));
      render(data);
      status.textContent = message;
    } catch {
      status.textContent = 'Could not save the record in this browser.';
    }
  }
  function render(data) {
    const picker = find('#coreReportLoad');
    picker.replaceChildren(new Option('Choose a saved date', ''));
    for (const date of Object.keys(data.production).sort().reverse()) picker.add(new Option(date, date));
    picker.value = Object.hasOwn(data.production, production.elements.date.value) ? production.elements.date.value : '';
    const rockList = find('[data-core-rockford]');
    rockList.replaceChildren();
    let funded = 0;
    let open = 0;
    for (const entry of Object.values(data.rockford)) {
      funded += entry.funded;
      open += entry.open;
      const item = document.createElement('li');
      item.textContent = entry.rep + ' · ' + entry.quarter + ' · ' + entry.funded + ' funded · ' + entry.open + ' supported open';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn';
      edit.textContent = 'Edit';
      edit.onclick = () => {
        for (const field of ['rep', 'quarter', 'funded', 'open']) rockford.elements[field].value = entry[field];
      };
      item.append(' ', edit);
      rockList.append(item);
    }
    find('[data-core-rockford-result]').textContent = Object.keys(data.rockford).length ?
      funded + ' funded · ' + open + ' supported open · ' + Math.max(0, 60 - funded - open) + ' gap to 60' : 'No Rockford forecast saved.';
    const auditList = find('[data-core-audits]');
    auditList.replaceChildren();
    for (const entry of data.audits) {
      const item = document.createElement('li');
      item.textContent = [entry.reference, entry.action, entry.owner, 'due ' + entry.due.replace('T', ' '), entry.comparableReference].filter(Boolean).join(' · ');
      for (const [name, label] of [['correction', 'Corrected file verified'], ['comparable', 'Next comparable file verified']]) {
        const check = document.createElement('button');
        check.type = 'button';
        check.className = 'btn';
        check.textContent = entry[name] ? label + ' · ' + new Date(entry[name]).toLocaleDateString('en-US', {timeZone: 'America/New_York'}) : label;
        check.disabled = Boolean(entry[name]) || (name === 'comparable' && !entry.correction);
        check.onclick = () => {
          const comparableReference = name === 'comparable' ? window.prompt('Next comparable file reference')?.trim() : '';
          if (name === 'comparable' && (!comparableReference || comparableReference.length > 80)) return;
          save(data => {
            const saved = data.audits.find(row => row.id === entry.id);
            if (!saved || saved[name]) return;
            saved[name] = new Date().toISOString();
            if (comparableReference) saved.comparableReference = comparableReference;
          }, 'Audit verification saved.');
        };
        item.append(' ', check);
      }
      auditList.append(item);
    }
  }
  window.addEventListener('core-team-sync-updated', () => {
    try { render(readExecution()); }
    catch { status.textContent = 'Could not show the shared execution records.'; }
  });
  renderFields();
  production.addEventListener('input', results);
  find('#coreReportLoad').addEventListener('change', event => {
    const date = event.target.value;
    if (!date) return;
    const row = readExecution().production[date];
    production.elements.date.value = date;
    for (const [name] of fields) production.elements[name].value = row[name] ?? '';
    results();
  });
  production.addEventListener('submit', event => {
    event.preventDefault();
    const date = production.elements.date.value;
    const metrics = results();
    if (Object.values(metrics).every(value => value === null)) {
      status.textContent = 'Enter at least one verified total.';
      return;
    }
    save(data => { data.production[date] = metrics; }, 'Scorecard saved for ' + date + '.');
  });
  rockford.addEventListener('submit', event => {
    event.preventDefault();
    const {rep, quarter, funded, open} = rockford.elements;
    const name = rep.value.trim();
    if (!name || count(funded) === null || count(open) === null) return;
    const id = name.toLowerCase().replace(/\s+/g, ' ') + '|' + quarter.value;
    save(data => {
      data.rockford[id] = {rep: name, quarter: quarter.value, funded: count(funded), open: count(open)};
    }, 'Rockford forecast updated.');
  });
  audit.addEventListener('submit', event => {
    event.preventDefault();
    const row = Object.fromEntries([...new FormData(audit)].map(([name, value]) => [name, value.trim()]));
    if (!Object.values(row).every(Boolean)) return;
    save(data => { data.audits.push({...row, id: crypto.randomUUID()}); }, 'File audit added.');
    audit.reset();
  });
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' && Boolean(value.trim()) && value.length <= 300;
  const whole = value => Number.isSafeInteger(value) && value >= 0;
  const optionalCount = value => value === null || whole(value);
  const timestamp = value => value === undefined || value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
  const dueDate = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value) && timestamp(value);
  const rowsValid = (rows, validate) => Array.isArray(rows) && rows.every(row => object(row) && text(row.id) && validate(row));
  const mapValid = (rows, validate) => object(rows) && Object.entries(rows).every(([id, row]) => object(row) && validate(id, row));
  function validTransfer(file) {
    if (file?.version !== 1 || !object(file.execution) || !object(file.huddle)) return false;
    const {execution, huddle} = file;
    return mapValid(execution.production, (date, row) => /^2027-\d\d-\d\d$/.test(date) && timestamp(date) &&
        fields.every(([name]) => optionalCount(row[name]))) &&
      mapValid(execution.rockford, (id, row) => text(row.rep) && /^Q[1-4]$/.test(row.quarter) &&
        whole(row.funded) && whole(row.open) && id === row.rep.toLowerCase().replace(/\s+/g, ' ') + '|' + row.quarter) &&
      rowsValid(execution.audits, row => text(row.reference) && text(row.action) && text(row.owner) &&
        dueDate(row.due) && timestamp(row.correction) && timestamp(row.comparable) &&
        (!row.comparable || (row.correction && text(row.comparableReference)))) &&
      mapValid(huddle.snapshots, (date, row) => /^2027-0[1-3]-\d\d$/.test(date) && timestamp(date) &&
        whole(row.leads) && whole(row.starts) && ['funded', 'approvals', 'contracts'].every(name => optionalCount(row[name]))) &&
      rowsValid(huddle.actions, row => text(row.action) && text(row.owner) && dueDate(row.due) && timestamp(row.checked));
  }
  find('[data-core-export]').addEventListener('click', () => {
    try {
      const data = {version: 1, execution: readExecution(), huddle: readHuddle()};
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'core-2027-director-transfer.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      status.textContent = 'Could not export saved records.';
    }
  });
  function mergeRows(incoming, current) {
    return [...new Map([...incoming, ...current].map(row => [row.id, row])).values()];
  }
  find('[data-core-import]').addEventListener('change', async event => {
    const input = event.target;
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw Error('File is too large');
      const incoming = JSON.parse(await file.text());
      if (!validTransfer(incoming)) throw Error('Invalid transfer format');
      const current = readExecution();
      const huddle = readHuddle();
      const merged = {
        production: {...incoming.execution.production, ...current.production},
        rockford: {...incoming.execution.rockford, ...current.rockford},
        audits: mergeRows(incoming.execution.audits, current.audits)
      };
      const nextHuddle = {
        snapshots: {...incoming.huddle.snapshots, ...huddle.snapshots},
        actions: mergeRows(incoming.huddle.actions, huddle.actions)
      };
      localStorage.setItem(key, JSON.stringify(merged));
      try {
        localStorage.setItem(huddleKey, JSON.stringify(nextHuddle));
      } catch (error) {
        localStorage.setItem(key, JSON.stringify(current));
        throw error;
      }
      render(merged);
      window.dispatchEvent(new Event('director-core-huddle-imported'));
      status.textContent = 'Transfer imported. Existing records were retained where the date or record matched.';
    } catch {
      status.textContent = 'Could not import this transfer file. Check the file format and browser storage.';
    }
  });
  try {
    render(readExecution());
  } catch {
    status.textContent = 'Could not load saved execution records.';
  }
  results();
})();
