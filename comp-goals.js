const DirectorCompGoals = (() => {
const defs=[{id:'channel',name:'Channel partners',weight:.15,min:4,meets:5,exceeds:6,base:1},{id:'a',name:'A-level incl. Channel',weight:.15,min:22,meets:25,exceeds:30,base:20},{id:'b',name:'B-or-higher',weight:.20,min:53,meets:60,exceeds:72,base:41},{id:'p',name:'Monthly leads per active',weight:.30,min:.85,meets:1,exceeds:1.15,base:null},{id:'active',name:'Active partners',weight:.20,min:180,meets:200,exceeds:220,base:128}];
function compensationGoalGaps(counts) {
  return defs.map(def => {
    const value = counts[def.id];
    if (!Number.isFinite(value)) return {def, state:'unverified', gap:null};
    const gap = Math.max(0, def.meets - value);
    return {def, state:gap === 0 ? 'met' : 'short', gap};
  });
}
const compensationActions = {
  channel: 'Director: review A partners approaching 10 rolling fundings and confirm the next supported opportunity.',
  a: 'Director: review B partners approaching four rolling fundings and assign the next action.',
  b: 'Amanda: prioritize C partners approaching two rolling fundings and log the next named introduction.',
  p: 'Director and RMs: review first and repeat referrals with eligible partners. Use verified quarter leads and all three month-end active counts.',
  active: 'Director and RMs: review partners nearing the end of their 90-day activity window. Confirm actual qualifying leads or fundings.'
};
return {defs, actions:compensationActions, gaps:compensationGoalGaps};
})();
