(() => {
  const root = document.getElementById('directorFundingForecast');
  const form = root.querySelector('form');
  const status = root.querySelector('[role=status]');
  const result = root.querySelector('[data-forecast-results]');
  const storageKey = 'director-funding-forecast-v1';
  const columns = ['file_id', 'stage', 'funding_date', 'status', 'blocker', 'owner', 'next_action'];
  const targets = [80, 120, 120, 80];
  const day = 86400000;
  const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

  function csvRows(text) {
    const records = [];
    let fields = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && (char === ',' || char === '\n')) {
        fields.push(field.trim());
        field = '';
        if (char === '\n') { records.push(fields); fields = []; }
      } else if (char !== '\r') field += char;
    }
    if (quoted) throw Error('A CSV field has an unclosed quote.');
    if (fields.length || field.trim()) records.push([...fields, field.trim()]);
    return records.filter(row => row.some(Boolean));
  }
  function importRows(text, asOf) {
    const [header, ...data] = csvRows(text.replace(/^\uFEFF/, ''));
    if (!header || new Set(header).size !== header.length || columns.some(name => !header.includes(name))) {
      throw Error('Use the required CSV column names.');
    }
    if (!data.length) throw Error('The CSV has no loan rows.');
    const ids = new Set();
    return data.map((cells, index) => {
      const row = Object.fromEntries(columns.map(name => [name, cells[header.indexOf(name)] || '']));
      const id = row.file_id.toLowerCase();
      const state = row.status.toLowerCase().replace(/\s+/g, '_');
      if (cells.length !== header.length || !id || ids.has(id) || !row.stage || !validDay(row.funding_date) ||
        !['funded','expected','at_risk'].includes(state) || (state === 'funded' && row.funding_date > asOf) ||
        (state !== 'funded' && (!row.owner || !row.next_action)) || (state === 'at_risk' && !row.blocker)) {
        throw Error('Check file ' + (index + 2) + ': use a unique ID, valid date and status, and required follow-up fields.');
      }
      ids.add(id);
      return {...row, status:state};
    });
  }
  function render(snapshot) {
    if (!snapshot) return;
    form.elements.asOf.value = snapshot.asOf;
    const {asOf, loans} = snapshot;
    const summary = root.querySelector('[data-forecast-summary]');
    summary.textContent = 'Encompass forecast through ' + asOf + ' · ' + loans.length + ' unique files.';
    result.replaceChildren();
    const row = (list, message) => {
      const item = document.createElement('li');
      item.textContent = message;
      list.append(item);
    };
    const quarterList = document.createElement('ul');
    for (const [index, goal] of targets.entries()) {
      const quarter = loans.filter(loan => loan.funding_date.startsWith('2027-') &&
        Math.floor((Number(loan.funding_date.slice(5, 7)) - 1) / 3) === index &&
        (loan.status === 'funded' || loan.funding_date >= asOf));
      const count = state => quarter.filter(loan => loan.status === state).length;
      const funded = count('funded'), expected = count('expected'), risk = count('at_risk');
      row(quarterList, '2027 Q' + (index + 1) + ' · ' + funded + ' funded / ' + goal + ' · ' + expected +
        ' expected · ' + risk + ' at risk · ' + Math.max(0, goal - funded - expected) + ' still to cover');
    }
    const horizonList = document.createElement('ul');
    for (const horizon of [30, 60, 90]) {
      const end = new Date(Date.parse(asOf) + horizon * day).toISOString().slice(0, 10);
      const within = loans.filter(loan => loan.funding_date >= asOf && loan.funding_date <= end);
      row(horizonList, 'Next ' + horizon + ' days · ' + within.filter(loan => loan.status === 'expected').length +
        ' expected · ' + within.filter(loan => loan.status === 'at_risk').length + ' at risk');
    }
    const riskList = document.createElement('ul');
    for (const loan of loans.filter(loan => loan.status === 'at_risk' || (loan.status === 'expected' && loan.funding_date < asOf))
      .sort((a,b) => a.funding_date.localeCompare(b.funding_date))) {
      row(riskList, [loan.file_id, loan.funding_date, loan.stage, loan.blocker || 'Funding date slipped', loan.owner, loan.next_action].join(' · '));
    }
    const title = document.createElement('h4');
    title.textContent = 'At-risk and slipped files';
    if (!riskList.childElementCount) row(riskList, 'No at-risk or slipped files in this export.');
    result.append(quarterList, horizonList, title, riskList);
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    const file = form.elements.forecastFile.files[0];
    const asOf = form.elements.asOf.value;
    if (!file || !validDay(asOf)) return;
    button.disabled = true;
    try {
      if (file.size > 2 * 1024 * 1024) throw Error('Use a CSV smaller than 2 MB.');
      const snapshot = {asOf, loans: importRows(await file.text(), asOf)};
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
      render(snapshot);
      status.textContent = 'Forecast saved in this browser.';
    } catch (error) {
      status.textContent = error.message || 'Could not load the forecast.';
    } finally {
      button.disabled = false;
    }
  });
  window.addEventListener('core-team-sync-updated', () => {
    try { render(JSON.parse(localStorage.getItem(storageKey) || 'null')); }
    catch { status.textContent = 'The saved forecast could not be loaded.'; }
  });
  try { render(JSON.parse(localStorage.getItem(storageKey) || 'null')); }
  catch { status.textContent = 'The saved forecast could not be loaded.'; }
})();
