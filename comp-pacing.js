(() => {
  const {defs, actions, gaps} = DirectorCompGoals;
  const root = document.getElementById('directorCompPace');
  const form = root.querySelector('form');
  const fields = root.querySelector('[data-comp-fields]');
  const status = root.querySelector('[role=status]');
  const list = root.querySelector('[data-comp-gaps]');
  const storageKey = 'director-comp-pacing-v1';
  for (const def of defs) {
    const block = document.createElement('div');
    block.className = 'field';
    const label = document.createElement('label');
    label.htmlFor = 'pace-' + def.id;
    label.textContent = def.name + ' / ' + def.meets;
    const input = document.createElement('input');
    input.id = label.htmlFor;
    input.name = def.id;
    input.type = 'number';
    input.min = '0';
    input.step = def.id === 'p' ? 'any' : '1';
    block.append(label, input);
    fields.append(block);
  }
  function render(entry) {
    list.replaceChildren();
    if (!entry) return;
    form.elements.asOf.value = entry.asOf;
    form.elements.source.value = entry.source;
    root.querySelector('[data-comp-date]').textContent = 'Planning figures through ' + entry.asOf + ' · ' + entry.source;
    for (const {def, state, gap} of gaps(entry.counts)) {
      const value = entry.counts[def.id];
      form.elements[def.id].value = value ?? '';
      const item = document.createElement('li');
      const missing = def.id === 'p' ? Number(gap?.toPrecision(4)) : gap;
      item.textContent = def.name + ' · ' + (value ?? 'Evidence pending') + ' / ' + def.meets +
        (state === 'short' ? ' · ' + missing + ' short. ' + actions[def.id] :
          state === 'met' ? ' · Meets target' : '');
      list.append(item);
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const source = form.elements.source.value.trim();
    const counts = Object.fromEntries(defs.map(({id}) => {
      const value = form.elements[id].valueAsNumber;
      return [id, Number.isFinite(value) ? value : null];
    }));
    const chain = ['channel','a','b','active'].map(id => counts[id]).filter(value => value !== null);
    if (!source || Object.values(counts).every(value => value === null) ||
        chain.some((value, index) => index > 0 && value < chain[index - 1])) {
      status.textContent = 'Enter a source and at least one figure. Channel is included in A-level, A-level in B-or-higher, and B-or-higher in active.';
      return;
    }
    const entry = {asOf:form.elements.asOf.value, source, counts};
    try {
      localStorage.setItem(storageKey, JSON.stringify(entry));
      render(entry);
      status.textContent = 'Weekly planning figures saved in this browser.';
    } catch {
      status.textContent = 'Could not save the weekly figures.';
    }
  });
  window.addEventListener('core-team-sync-updated', () => {
    try { render(JSON.parse(localStorage.getItem(storageKey) || 'null')); }
    catch { status.textContent = 'Could not load saved weekly figures.'; }
  });
  try { render(JSON.parse(localStorage.getItem(storageKey) || 'null')); }
  catch { status.textContent = 'Could not load saved weekly figures.'; }
})();
