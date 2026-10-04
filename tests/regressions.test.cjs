// Run with: node --test tests/regressions.test.cjs
// Execute the shipped inline script with a small DOM/storage adapter; no dependencies.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');
const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const source = script.slice(0, script.lastIndexOf('\nsetupRevealToggle();'));

function game(seed) {
  const nodes = new Map(), storage = new Map();
  function element() {
    return { style: {}, classList: { add() {}, remove() {} }, children: [],
      set innerHTML(value) { this.html=value;this.children=[]; }, get innerHTML() { return this.html || ''; },
      appendChild(child) { this.children.push(child); }, addEventListener() {} };
  }
  const document = {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); },
    querySelectorAll() { return []; }, querySelector() { return nodes.get('evChoices')?.children.find(c=>c.className==='choice') || null; }, createElement: element,
  };
  const context = vm.createContext({ document, console, setTimeout() {}, clearTimeout() {},
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) } });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  if (seed != null) run(`let rngState=${seed};Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};`);
  run("state.name='测试'; state.position='前锋'; assignTeam('甲组', GROUPS['甲组'][0]);");
  return { run, nodes };
}

function finishAdjustments({run,nodes}) {
  let guard=0;
  while(run("document.getElementById('evTitle').textContent==='大败后的调整' && !document.getElementById('mHeader').innerHTML.includes('赛事收官')")) {
    assert.ok(guard++<20,'adjustments must resume the tournament');
    nodes.get('evChoices').children[0].onclick();
    run("document.getElementById('betweenNext').onclick();");
  }
}

test('all league champions qualify for the following Super Cup', () => {
  for (const league of ['甲组', '乙组', '同济组']) {
    const { run } = game();
    run(`assignTeam(${JSON.stringify(league)}, GROUPS[${JSON.stringify(league)}][0]);
      state.seasonChampions={jia:'旧甲冠军',yi:'旧乙冠军',tongji:'旧同济冠军'};
      tourney={type:'华工杯',league:state.league,role:'player',stage:'knockout',playerGoals:0,
        knockoutRounds:[[{winner:state.team.name}]]};
      finishTournament();
      document.getElementById('mBtn1').onclick();
      launchSuperCup(false);`);
    assert.equal(run('tourney.superRound'), league === '甲组' ? 1 : 0);
    assert.equal(run(`state.seasonChampions[CHAMPION_KEYS[${JSON.stringify(league)}]]`), run('state.team.name'));
  }
});

test('relegation route also produces a champion for its own league', () => {
  const { run } = game();
  run(`state.seasonChampions={jia:'旧冠军',yi:'旧冠军',tongji:'旧冠军'};
    const groups=groupTeams(state.rosters['甲组'],groupSizesFor('华工杯','甲组'));
    groups.forEach(g=>{g.matches=simulateGroupMatches(g,null);g.matches.forEach(m=>{
      if(m.home===state.team.name){m.hg=0;m.ag=10;}
      if(m.away===state.team.name){m.hg=10;m.ag=0;}
    });});
    const qualified=groups.flatMap(g=>computeTable(g.teams,g.matches).slice(0,4).map(r=>r.team));
    tourney={type:'华工杯',league:'甲组',role:'player',stage:'relegation',relegated:false,playerGoals:0,groups};finishTournament();`);
  assert.ok(run('qualified.includes(state.seasonChampions.jia)'));
  assert.notEqual(run('state.seasonChampions.jia'), run('state.team.name'));
});

test('five-year medical cross-exam ends overseas route and preserves a full masters stage', () => {
  for (const overseas of [true, false]) {
    const { run } = game();
    run(`assignTeam('同济组','法医学系'); state.year=4; state.stats.academy=100;
      Math.random=()=>${overseas ? 0.1 : 0.4};
      milestoneEvent(4,state).choices.find(c=>c.text==='跨考').resolve(state); yearEnd();`);
    assert.equal(run('state.medical'), false);
    assert.equal(run('undergraduateYears(state)'), 5);
    assert.equal(run("document.getElementById('btnYearEnd').textContent"), overseas ? '查看结局' : '进入下一年');
    if (!overseas) {
      assert.equal(run("yearName(5,'读研')"), '研一');
      assert.equal(run("academicYears('读研',state)"), 8);
      assert.equal(run('milestoneEvent(7,state).title'), '读博抉择');
    }
  }
});

test('early medical transfer still changes to the ordinary four-year curriculum', () => {
  const { run } = game();
  run("assignTeam('同济组','基础医学院'); state.year=1; assignTransferCollege(state,true);");
  assert.equal(run('state.year'), 0);
  assert.equal(run('academicYears(state.path,state)'), 4);
});

test('already overdue saves can still finish', () => {
  const { run } = game();
  run("state.year=5;state.path='外校深造';yearEnd();");
  assert.equal(run("document.getElementById('btnYearEnd').textContent"), '查看结局');
});

test('clinical captain receives a temporary home identity even after same-year streaming', () => {
  for (const college of ['第一临床学院','第二临床学院']) {
    const { run } = game();
    run(`assignTeam('同济组','基础医学院');state.year=2;state.isCaptain=true;
      const process=processQueue;processQueue=()=>{};startYear();processQueue=process;
      const cup=queue.find(x=>x.tourney==='新生杯');
      medicalStreamEvent(state).choices.find(c=>c.text===${JSON.stringify(college)}).resolve(state);
      queue=[cup];processQueue();`);
    assert.equal(run('state.team.name'), '基础医学院');
    assert.ok(run('tourney.myGroup'));
    assert.equal(run('tourney.role'), 'coach');
    run('yearEnd=()=>{};tourney.onDone();');
    assert.equal(run('state.team.name'), college);
    assert.equal(run('state.league'), '同济组');
    assert.equal(run('state.medicalCupAlias'), false);
  }
});

test('old saves receive missing rosters, flags and Super Cup champions', () => {
  const { run } = game();
  run(`const old=JSON.parse(JSON.stringify(state));old.year=1;delete old.seasonChampions;
    delete old.rosters['同济组'];delete old.flags.warmedUpMatch;
    localStorage.setItem(SAVE_KEY,JSON.stringify({state:old}));`);
  assert.equal(run('loadGame()'), true);
  assert.equal(run("state.rosters['同济组'].length"), 8);
  assert.equal(run('state.flags.warmedUpMatch'), false);
  assert.doesNotThrow(() => run('startYear();'));
  assert.equal(run('tourney.type'), '超级杯');
});

test('migration uses latest Chinese-key results without changing promotion rosters', () => {
  const { run } = game();
  run(`const promoted=GROUPS['乙组'][0];swapDivision(promoted,GROUPS['甲组'][0]);
    const expected=JSON.stringify(state.rosters);
    state.seasonChampions={jia:'旧甲冠军',yi:'旧乙冠军',tongji:'旧同济冠军',
      '甲组':'新甲冠军','乙组':'新乙冠军','同济组':'新同济冠军'};saveGame();loadGame();`);
  assert.equal(run('state.seasonChampions.jia'), '新甲冠军');
  assert.equal(run('state.seasonChampions.yi'), '新乙冠军');
  assert.equal(run('state.seasonChampions.tongji'), '新同济冠军');
  assert.equal(run('JSON.stringify(state.rosters)===expected'), true);
});

test('stay-up training is inserted before milestones and keeps progress accounting', () => {
  const { run } = game();
  run(`state.year=3;state.flags.stayUpChain=true;state.yearPlanTotal=1;state.yearPlanDone=0;
    queue=[{type:'event',ev:milestoneEvent(3,state)}];const shown=[];renderEvent=ev=>shown.push(ev);
    processQueue();`);
  assert.equal(run('shown[0].stayUpChain'), true);
  assert.equal(run('queue[0].ev.title'), '升学抉择');
  run('processQueue();');
  assert.equal(run('shown[1].title'), '升学抉择');
  assert.equal(run('state.yearPlanTotal'), 2);
  assert.equal(run('state.yearPlanDone'), 2);
});

test('doctoral labels agree with milestones, including delayed masters graduation', () => {
  const { run } = game();
  run("state.path='读博';");
  for (const [year, label] of [[7,'博一'],[8,'博二'],[9,'博三']]) {
    assert.equal(run(`yearName(${year},state.path)`), label);
    assert.ok(run(`milestoneEvent(${year},state).title`).startsWith(label));
  }
  run("state.path='读研';state.year=7;state.extendedYears=1;Math.random=()=>0;milestoneEvent(7,state).choices[0].resolve(state);");
  assert.equal(run("yearName(8,state.path)"), '博一');
  assert.ok(run('milestoneEvent(8,state).title').startsWith('博一'));
  assert.equal(run('academicYears(state.path,state)'), 11);
});

test('inherited achievements survive initialization and save migration', () => {
  const { run } = game();
  run("state.achievements.first_goal=true;inheritAchievements();assignTeam('甲组',GROUPS['甲组'][0]);saveGame();loadGame();");
  assert.equal(run('!!state.achievements.first_goal'), false);
  assert.equal(run('loadInheritedAchievements().first_goal'), true);
  assert.equal(run('achievementCount()'), 1);
});

test('achievement workflow treats titles as data and appends each exact name only once', () => {
  const workflow=readFileSync(join(__dirname,'..','.github/workflows/full-achievers.yml'),'utf8');
  assert.match(workflow,/ISSUE_TITLE: \$\{\{ github.event.issue.title \}\}/);
  const script=join(__dirname,'..','.github/scripts/update-full-achievers.mjs');
  const dir=mkdtempSync(join(tmpdir(),'hustcup-workflow-'));
  try {
    const list=join(dir,'FULL_ACHIEVERS.md');
    const output=join(dir,'github-output.txt');
    writeFileSync(list,'# 玩家\n- 暂无登记玩家\n');
    const title='全成就玩家登记：$(touch INJECTED) `touch ALSO_INJECTED` "测试"';
    const execute=t=>spawnSync(process.execPath,[script],{
      cwd:dir,env:{...process.env,ISSUE_TITLE:t,LIST_FILE:list,GITHUB_OUTPUT:output},encoding:'utf8'});
    for(const t of [title,title,'全成就玩家登记：测试','全成就玩家登记：测试玩家']) {
      const result=execute(t);assert.equal(result.status,0,result.stderr);
    }
    assert.equal(existsSync(join(dir,'INJECTED')),false);
    assert.equal(existsSync(join(dir,'ALSO_INJECTED')),false);
    const lines=readFileSync(list,'utf8').trim().split('\n').filter(Boolean);
    assert.ok(lines.includes('# 玩家'));
    assert.ok(lines.some(line=>line.startsWith('- 测试')));
    assert.ok(!lines.some(line=>line.includes('$(')||line.includes('`')));
    assert.equal(lines.filter(line=>line.startsWith('- 测试')).length,2);
    assert.equal(readFileSync(output,'utf8').match(/status=duplicate/g).length,1);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test('medical final year keeps the graduation cup without the removed farewell event', () => {
  const { run } = game();
  run("assignTeam('同济组','法医学系');state.year=4;processQueue=()=>{};startYear();");
  assert.equal(run("queue.filter(x=>x.tourney==='毕业杯').length"), 1);
  assert.equal(run("queue.some(x=>x.ev && x.ev.title==='大五告别战')"), false);
  assert.equal(run('typeof farewellMatchEvent'), 'undefined');
});

test('archive achievements count for an older career and newly unlocked goals persist immediately', () => {
  const { run } = game();
  run("state.achievements.first_goal=true;inheritAchievements();state.achievements={};");
  assert.equal(run('achievementCount()'), 1);
  run('state.careerGoals=20;checkAchievements(state);');
  assert.equal(run('loadInheritedAchievements().goal_hunter'), true);
});

test('simulation button completes matches for every position with and without military injury protection', () => {
  for (const position of ['前锋', '中场', '后卫', '门将']) {
    for (const shield of [0, 2]) {
      const { run } = game();
      run(`state.position=${JSON.stringify(position)};state.injuryShieldYears=${shield};
        Math.random=()=>0.5;launchTournament('华工杯','player',()=>{});
        const match=myMatchesLeft()[0];renderMatchModeChoice(match,false);`);
      assert.doesNotThrow(() => run("document.getElementById('mModeSim').onclick();"), `${position}, shield=${shield}`);
      assert.equal(run('match.done'), true);
      assert.equal(run('Number.isFinite(match.hg) && Number.isFinite(match.ag)'), true);
      assert.equal(run("typeof document.getElementById('mBtn1').onclick"), 'function');
    }
  }
});

test('military protection reduces injury probability without eliminating injuries', () => {
  for (const [shield, random, injured] of [[0, 0.01, true], [2, 0.01, false], [2, 0.003, true]]) {
    const { run } = game();
    run(`state.stats={ability:60,mentality:60,relation:60,academy:60};
      state.injuryShieldYears=${shield};tourney={role:'player',matchInjuryRisk:0};Math.random=()=>${random};`);
    assert.doesNotThrow(() => run('rollMatchInjury();'));
    assert.equal(run('!!state.injury'), injured);
  }
});


test('new careers render archived achievements gray, current achievements gold, and unknown ones hidden', () => {
  const { run } = game();
  run("saveInheritedAchievements({first_goal:true});assignTeam('甲组',GROUPS['甲组'][0]);renderAchievements('summary','grid');");
  assert.equal(run('Object.keys(state.achievements).length'), 0);
  const total=run('ACHIEVEMENTS.length');
  assert.equal(run("document.getElementById('summary').innerHTML"), `本档解锁 <b>0 / ${total}</b> · 累计解锁 <b>1 / ${total}</b>`);
  assert.match(run("document.getElementById('grid').innerHTML"), /ach-item inherited[\s\S]*?处子进球[\s\S]*?历史已解锁/);
  assert.match(run("document.getElementById('grid').innerHTML"), /ach-item locked[\s\S]*?？？？/);
  run("state.careerGoals=1;checkAchievements(state);renderAchievements('summary','grid');");
  assert.equal(run('state.achievements.first_goal'), true);
  assert.equal(run('achievementCount()'), 1);
  assert.match(run("document.getElementById('grid').innerHTML"), /ach-item unlocked[\s\S]*?处子进球[\s\S]*?本档已解锁/);
});

test('legacy mixed saves keep all historical honors but only highlight demonstrable current achievements', () => {
  const { run } = game();
  run("state.achievements={first_goal:true,all_rounder:true};state.careerGoals=1;delete state.achievementScopeVersion;saveGame();loadGame();");
  assert.equal(run('state.achievements.first_goal'), true);
  assert.equal(run('!!state.achievements.all_rounder'), false);
  assert.equal(run('loadInheritedAchievements().all_rounder'), true);
  assert.equal(run('achievementCount()'), 2);
  assert.equal(run('state.achievementScopeVersion'), 2);
});

test('current unlocks remain highlighted after save reload even if their transient condition no longer holds', () => {
  const { run } = game();
  run("state.achievements={all_rounder:true};saveGame();state.achievements={};loadGame();");
  assert.equal(run('state.achievements.all_rounder'), true);
});

test('full-achievement registration still counts archived honors in a fresh career', () => {
  const { run } = game();
  run("saveInheritedAchievements(Object.fromEntries(ACHIEVEMENTS.map(a=>[a.id,true])));assignTeam('甲组',GROUPS['甲组'][0]);checkAchievements(state);");
  assert.equal(run('Object.keys(state.achievements).length'), 0);
  assert.equal(run('achievementCount()'), run('ACHIEVEMENTS.length'));
  assert.equal(run('state.achievementPromptShown'), true);
});

test('yearly events are unique, offer genuine study choices and include adversity', () => {
  for (const mode of ['full','fast']) for (const college of ['计算机科学与技术学院','基础医学院','药学院']) {
    const {run}=game(73);
    run(`assignTeam(${JSON.stringify(college==='计算机科学与技术学院'?'甲组':'同济组')},${JSON.stringify(college)});
      state.gameMode=${JSON.stringify(mode)};processQueue=()=>{};`);
    for(let year=0;year<8;year++) {
      run(`state.year=${year};state.calendarYear=2026+${year};if(state.year>=5)state.path='读研';startYear();
        var regularItems=queue.filter(x=>x.ev && x.ev.tag==='常规事件').map(x=>x.ev);`);
      assert.equal(run('new Set(regularItems.map(e=>e.id)).size'),run('regularItems.length'));
      assert.equal(run('regularItems.length'),mode==='fast'?4:year>=5?6:8);
      assert.ok(run('regularItems.filter(e=>e.choices.some(c=>c.study && c.good.academy>0)).length') >= (mode==='fast'?2:year>=5?3:4));
      assert.ok(run('regularItems.some(e=>e.pressure)'));
      run('regularItems.forEach(rememberEvent);');
    }
  }
});

test('academic replacement uses event IDs even when selected entries are cloned', () => {
  const {run}=game(3);
  run(`const study=REGULAR_EVENTS.find(e=>e.id==='course_study_group');
    const before=[{tag:'常规事件',...study},{...REGULAR_EVENTS.find(e=>e.id==='extra_training')}], after=[];
    ensureAcademicEvents([study,...REGULAR_EVENTS],before,after,2);`);
  assert.equal(run('new Set(before.map(e=>e.id)).size'),2);
  assert.equal(run('before.filter(e=>e.choices.some(c=>c.study)).length'),2);
});

test('recent ordinary events rotate when the eligible pool can meet the quotas', () => {
  const {run}=game(8);
  run(`processQueue=()=>{};startYear();const first=queue.filter(x=>x.ev && x.ev.tag==='常规事件').map(x=>x.ev);
    first.forEach(rememberEvent);state.year=1;state.calendarYear++;startYear();
    const second=queue.filter(x=>x.ev && x.ev.tag==='常规事件').map(x=>x.ev);`);
  assert.equal(run('second.some(e=>first.some(old=>old.id===e.id))'),false);
});

test('study gains continue above 92 and fractional athletic gains survive saving', () => {
  const {run}=game();
  run(`state.stats={ability:92,mentality:60,relation:60,academy:92};
    const preview=balanceEffects({ability:1,academy:1});const beforePreview=JSON.stringify(state.statRemainders);
    balanceEffects({ability:1,academy:1});`);
  assert.equal(run('JSON.stringify(state.statRemainders)===beforePreview'),true);
  run('applyStats({ability:1,academy:1});saveGame();loadGame();for(let i=0;i<9;i++)applyStats({ability:1,academy:1});');
  assert.equal(run('state.stats.ability'),93);
  assert.equal(run('state.stats.academy'),94);
  run('state.stats.academy=99;state.statRemainders.academy=.8;const bounded=applyStats({academy:5});');
  assert.equal(run('bounded.academy'),1);
  assert.equal(run('state.statRemainders.academy'),0);
});

test('fixed referee chances and medical exam reductions retain their rules', () => {
  const {run}=game();
  run(`const fixed={fixed:true,prob:.7,stat:'academy'};
    const fixedLow=choiceRollParams(fixed).p;state.stats.academy=100;const fixedHigh=choiceRollParams(fixed).p;
    assignTeam('同济组','基础医学院');state.year=1;
    const original=REGULAR_EVENTS.find(e=>e.id==='fail_crisis');
    const adapted=adaptEventForPlayer(original);`);
  assert.equal(run('fixedLow'),.7);assert.equal(run('fixedHigh'),.7);
  assert.equal(run('adapted.title'),'系统解剖学考试');
  assert.ok(Math.abs(run('choiceRollParams(adapted.choices[0]).p / choiceRollParams(original.choices[0]).p')-.8)<1e-9);
});

test('old saves default to full mode; fast mode and histories survive reloading', () => {
  const {run}=game();
  run(`const legacy={...state};delete legacy.gameMode;delete legacy.eventHistory;delete legacy.statRemainders;
    localStorage.setItem(SAVE_KEY,JSON.stringify({state:legacy}));loadGame();`);
  assert.equal(run('state.gameMode'),'full');
  assert.equal(run('Object.keys(state.eventHistory).length'),0);
  run("state.gameMode='fast';rememberEvent(REGULAR_EVENTS[0]);applyStats({ability:1});saveGame();loadGame();");
  assert.equal(run('state.gameMode'),'fast');
  assert.equal(run('state.eventHistory.extra_training'),2026);
  assert.ok(run('Number.isFinite(state.statRemainders.ability)'));
});

test('fast mode retains pharmacy, medical, transfer, graduation and doctoral milestones', () => {
  for(const [college,year,expected] of [
    ['药学院',0,'专业分流'], ['基础医学院',2,'医学分流'], ['法医学系',4,'升学抉择']
  ]) {
    const {run}=game(18);
    run(`assignTeam('同济组',${JSON.stringify(college)});state.gameMode='fast';state.year=${year};processQueue=()=>{};startYear();`);
    assert.ok(run(`queue.some(x=>x.ev && x.ev.title.includes(${JSON.stringify(expected)}))`));
    if(year===0) assert.ok(run('queue.some(x=>x.ev && x.ev.title.includes("转专业"))'));
    if(year===4) assert.equal(run('queue.filter(x=>x.tourney==="毕业杯").length'),1);
  }
  const {run}=game(5);
  run("state.gameMode='fast';state.path='读研';state.year=6;processQueue=()=>{};startYear();");
  assert.ok(run('queue.some(x=>x.ev && x.ev.title=== "读博抉择")'));
});

test('fast tournament completes all leagues, positions and injury states with the real match engine', () => {
  for(const league of ['甲组','乙组','同济组']) for(const position of ['前锋','中场','后卫','门将']) for(const unavailable of [false,true]) {
    const session=game(31),{run}=session;
    run(`assignTeam(${JSON.stringify(league)},GROUPS[${JSON.stringify(league)}][0]);state.position=${JSON.stringify(position)};
      state.gameMode='fast';state.flags.metWeiShihao=true;state.flags.metXuBin=true;
      if(${unavailable})state.injury={name:'测试伤病',severity:'轻微',matchesLeft:99};
      let finished=null;launchTournament('华工杯','player',r=>{finished=r;});`);
    finishAdjustments(session);
    assert.ok(run('!!tourney'));
    assert.match(run("document.getElementById('mHeader').innerHTML"),/赛事收官/);
    assert.equal(run('tourney.myGroup.matches.filter(m=>m.home===state.team.name || m.away===state.team.name).every(m=>m.done)'),true);
    assert.equal(run('state.cupSeasonCount'),unavailable?0:1);
    if(unavailable)assert.equal(run('state.careerGoals'),0);
    run("document.getElementById('mBtn1').onclick();");
    assert.equal(run('tourney'),null);
    assert.ok(run('finished && finished.rank'));
    assert.equal(run('state.rosters["甲组"].length'),12);
    assert.equal(run('state.rosters["乙组"].length'),17);
    assert.equal(run('state.rosters["同济组"].length'),8);
  }
});

test('fast mode preserves a selected easter egg as a manual choice and resumes the tournament', () => {
  const {run,nodes}=game(9);
  run(`state.gameMode='fast';rollEasterEgg=()=>EASTER_EVENTS[0];launchTournament('华工杯','player',()=>{});`);
  assert.equal(run('state.flags.metWeiShihao'),true);
  const choice=nodes.get('evChoices').children.at(-3);
  assert.equal(typeof choice.onclick,'function');
  choice.onclick();
  run("document.getElementById('easterNext').onclick();");
  finishAdjustments({run,nodes});
  assert.match(run("document.getElementById('mHeader').innerHTML"),/赛事收官/);
});

test('fast mode completes Super Cups for all champion slots and preserves coach identity', () => {
  for(const league of ['甲组','乙组','同济组']) {
    const {run}=game(12);
    run(`assignTeam(${JSON.stringify(league)},GROUPS[${JSON.stringify(league)}][0]);state.gameMode='fast';
      state.seasonChampions[CHAMPION_KEYS[state.league]]=state.team.name;processQueue=()=>{};launchSuperCup(false);`);
    assert.match(run("document.getElementById('mHeader').innerHTML"),/赛事收官/);
    assert.ok(run('Number.isFinite(state.careerGoals)'));
  }
  const {run}=game(13);
  run(`assignTeam('同济组','基础医学院');state.gameMode='fast';state.year=2;state.isCaptain=true;
    processQueue=()=>{};startYear();const cup=queue.find(x=>x.tourney==='新生杯');
    medicalStreamEvent(state).choices.find(c=>c.text==='第一临床学院').resolve(state);cup.before();
    launchTournament('新生杯','coach',()=>cup.after());document.getElementById('mBtn1').onclick();`);
  assert.equal(run('state.careerGoals'),0);
  assert.equal(run('state.team.name'),'第一临床学院');
  assert.equal(run('state.medicalCupAlias'),false);
});

test('manual matches avoid repeated event IDs and unavailable players never take penalties', () => {
  const {run}=game(14);
  run("launchTournament('华工杯','player',()=>{});prepareMatch(myMatchesLeft()[0],true);");
  assert.equal(run('new Set(tourney.keyQueue.map(k=>k.event.id)).size'),8);
  run('tourney.playerUnavailable=true;Math.random=()=>.1;');
  assert.equal(run('!!penaltyShootout(60,60).took'),false);
  run("tourney.playerUnavailable=false;tourney.role='coach';");
  assert.equal(run('!!penaltyShootout(60,60).took'),false);
});

test('probabilistic injury choices apply the extra risk instead of returning before it', () => {
  for(const [shield,random,repeat] of [[0,.04,true],[0,.1,false],[2,.04,false],[2,.01,true]]) {
    const {run}=game();
    run(`state.gameMode='fast';state.injuryShieldYears=${shield};Math.random=()=>${random};
      const ev=REGULAR_EVENTS.find(e=>e.id==='old_injury');chooseOption(ev,1);`);
    assert.equal(run('state.repeatYear'),repeat);
    assert.equal(run('state.ignoreDoctorCount'),1);
  }
});

test('between-match events remember their identities and prefer a different event next year', () => {
  const {run}=game(24);
  run("tourney={type:'华工杯'};const seen=BETWEEN_MATCH_EVENTS[0];rememberEvent(seen);state.calendarYear++;Math.random=()=>.1;const drawn=rollBetweenMatchEvent();");
  assert.notEqual(run('drawn.id'),run('seen.id'));
  assert.equal(run('new Set(BETWEEN_MATCH_EVENTS.map(e=>e.id)).size'),run('BETWEEN_MATCH_EVENTS.length'));
});

test('the 13-year honor waits for graduation and includes the repeated transfer year', () => {
  const {run}=game();
  run(`state.path='读博';state.flags.militaryServed=true;state.flags.transferExtended=true;
    const honor=ACHIEVEMENTS.find(a=>a.id==='highest_mountain_longest_river');state.year=8;state.cupSeasonCount=11;`);
  assert.equal(run('honor.check(state)'),false);
  run('state.year=9;state.cupSeasonCount=10;');
  assert.equal(run('honor.check(state)'),false);
  run('state.cupSeasonCount=11;');
  assert.equal(run('honor.check(state)'),true);
});

test('fast mode can finish the full transfer, military, masters and doctoral route', () => {
  const {run}=game();
  run(`state.gameMode='fast';state.stats={ability:95,mentality:95,relation:95,academy:95};state.injuryShieldYears=100;
    state.flags.metWeiShihao=true;state.flags.metXuBin=true;Math.random=()=>.1;
    let screen='scr-main', waiting=false, iterations=0, academicSeasons=0;
    const actualShow=show;show=scr=>{screen=scr;actualShow(scr);};
    const actualRender=renderEvent;renderEvent=ev=>{waiting=false;actualRender(ev);};
    const actualResult=showResult;showResult=(...args)=>{waiting=true;actualResult(...args);};
    while(screen!=='scr-ending' && iterations++<500){
      if(screen==='scr-main'){academicSeasons++;startYear();}
      else if(screen==='scr-year')document.getElementById('btnYearEnd').onclick();
      else if(screen==='scr-match')document.getElementById('mBtn1').onclick();
      else if(screen==='scr-event'){
        if(waiting){waiting=false;document.getElementById('btnNext').onclick();continue;}
        const ev=current;let i=0;
        if(ev.title==='足协招新' || ev.title==='队长竞选')i=1;
        else if(ev.title==='转专业考试')i=state.year===1?0:1;
        else if(ev.title==='升学抉择'){state.stats.academy=95;i=ev.choices.findIndex(c=>c.text==='保研本校');}
        else if(ev.title==='读博抉择'){state.stats.academy=95;i=0;}
        else {const study=ev.choices.findIndex(c=>c.study);if(study>=0)i=study;}
        chooseOption(ev,i);
      }else throw new Error('Unexpected screen '+screen);
    }`);
  assert.equal(run('screen'),'scr-ending');
  assert.equal(run('academicSeasons'),12); // The interrupted freshman year starts again after military service.
  assert.equal(run('state.militaryYearsCompleted'),2);
  assert.equal(run('state.flags.transferExtended'),true);
  assert.equal(run('state.path'),'读博');
  assert.equal(run('state.calendarYear'),2038);
  assert.equal(run('state.cupSeasonCount'),11);
  assert.equal(run('state.achievements.highest_mountain_longest_river'),true);
});

test('malformed or empty registration titles leave the remote achievement list untouched', () => {
  const script=join(__dirname,'..','.github/scripts/update-full-achievers.mjs');
  const dir=mkdtempSync(join(tmpdir(),'hustcup-invalid-'));
  try {
    const list=join(dir,'FULL_ACHIEVERS.md'),output=join(dir,'github-output.txt');
    const original='# 玩家\n- 原玩家\n';writeFileSync(list,original);
    for(const title of ['全成就玩家登记','全成就玩家登记：','全成就玩家登记错误格式']) {
      const result=spawnSync(process.execPath,[script],{env:{...process.env,ISSUE_TITLE:title,LIST_FILE:list,GITHUB_OUTPUT:output},encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
    }
    assert.equal(readFileSync(list,'utf8'),original);
    assert.equal(readFileSync(output,'utf8').match(/status=invalid/g).length,3);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('removed campus events are absent and coaching work requires an actual freshman coaching role', () => {
  const {run}=game(52);
  assert.equal(run("REGULAR_EVENTS.some(e=>['pitch_booking','internship_schedule','sport_data_assignment'].includes(e.id))"),false);
  assert.equal(run('CAMPUS_EVENTS.length'),13);
  run("state.year=3;state.isCaptain=true;const coaching=REGULAR_EVENTS.filter(e=>e.coachOnly);");
  assert.equal(run('coaching.length'),2);
  assert.equal(run('coaching.some(e=>e.cond(state))'),false);
  run("launchTournament('新生杯','player',()=>{});");
  assert.equal(run('coaching.some(e=>e.cond(state))'),false);
  run("launchTournament('新生杯','coach',()=>{});");
  assert.equal(run('coaching.every(e=>e.cond(state))'),true);
  run('saveGame();loadGame();');
  assert.equal(run('state.flags.freshmanCoach'),true);
});

test('a net loss of at least three triggers one manual adjustment in both modes and score orientations', () => {
  for(const mode of ['full','fast']) for(const home of [true,false]) for(const margin of [-2,-3,-4,3]) {
    const {run,nodes}=game(66);
    run(`launchTournament('华工杯','player',()=>{});const match={home:${home?'state.team.name':"GROUPS['甲组'][1]"},away:${home?"GROUPS['甲组'][1]":'state.team.name'},hg:null,ag:null};
      prepareMatch(match,false);state.gameMode=${JSON.stringify(mode)};
      tourney.baseHome=${home?5+margin:5};tourney.baseAway=${home?5:5+margin};
      tourney.easterEgg=null;tourney.interEventShown=true;rollMatchInjury=()=>{};
      let resumed=0;nextPlayerMatch=()=>resumed++;finishMatch();`);
    if(mode==='full')run("document.getElementById('mBtn1').onclick();");
    if(margin<=-3) {
      assert.equal(run("document.getElementById('evTitle').textContent"),'大败后的调整');
      assert.match(run("document.getElementById('evDesc').textContent"),/本场比分/);
      assert.equal(run('resumed'),0);
      nodes.get('evChoices').children[0].onclick();
      assert.ok(run('Object.values(state.stats).every(Number.isFinite)'));
      run("document.getElementById('betweenNext').onclick();");
    }
    assert.equal(run('resumed'),1);
  }
});

test('revealing post-match options keeps their match continuation instead of rendering an old daily event', () => {
  const {run,nodes}=game(81);
  run("let resumed=false;current=REGULAR_EVENTS[0];showBetweenMatchEvent(heavyDefeatEvent(0,4),()=>resumed=true);setupRevealToggle();document.getElementById('revealChoices').checked=true;document.getElementById('revealChoices').onchange();");
  assert.equal(run("document.getElementById('evTitle').textContent"),'大败后的调整');
  assert.match(nodes.get('evChoices').children[0].innerHTML,/成功/);
  nodes.get('evChoices').children[0].onclick();run("document.getElementById('betweenNext').onclick();");
  assert.equal(run('resumed'),true);
});

test('low-academy biological pharmacy retains its mandatory warning while preserving study and adversity slots', () => {
  for(const mode of ['full','fast']) {
    const {run}=game(92);
    run(`assignTeam('同济组','药学院');state.flags.pharmacyTrack=BIO_PHARMACY;
      state.gameMode=${JSON.stringify(mode)};state.stats.academy=50;processQueue=()=>{};
      const originalEvents=regularYearEvents;
      regularYearEvents=(count,target)=>{
        const study=REGULAR_EVENTS.filter(e=>e.choices.some(c=>c.study));
        const selected=study.slice(0,count-1).map(e=>({tag:'常规事件',...e}));
        selected.push({tag:'常规事件',...REGULAR_EVENTS.find(e=>e.id==='dorm_noise')});
        return {before:selected,after:[]};
      };startYear();const daily=queue.filter(x=>x.ev && x.ev.tag==='常规事件').map(x=>x.ev);`);
    assert.equal(run('daily.filter(e=>e.id==="academic_warning").length'),1);
    assert.ok(run('daily.some(e=>e.pressure)'));
    assert.ok(run('daily.filter(e=>e.choices.some(c=>c.study)).length') >= (mode==='fast'?2:4));
  }
});

test('year-end settlement never forces any mode into predetermined social ranges', () => {
  for(const mode of ['full','fast','easy']) for(const mentality of [0,20,60,80,100]) for(const relation of [0,20,60,80,100]) {
    const {run}=game(95);
    run(`state.gameMode=${JSON.stringify(mode)};annualGrowth=()=>({ability:0,mentality:0,relation:0,academy:0});
      for(let year=0;year<4;year++){
        state.year=year;state.calendarYear=2026+year;
        state.stats.mentality=${mentality};state.stats.relation=${relation};yearEnd();
      }`);
    assert.equal(run('state.completedCampusYears'),4);
    assert.equal(run('state.stats.mentality'),mentality);
    assert.equal(run('state.stats.relation'),relation);
    assert.doesNotMatch(run("document.getElementById('yrTable').innerHTML"),/78–82|70–80/);
  }
});

test('annual settlement leaves ability and academy rewards unchanged and settles a year only once', () => {
  const {run}=game(97);
  run(`state.stats={ability:70,mentality:10,relation:100,academy:60};
    annualGrowth=()=>({ability:2,mentality:-1,relation:1,academy:3});
    const expected=balanceEffects({ability:2,academy:3});const result=settleYearStats();
    const once=JSON.stringify(state);const duplicate=settleYearStats();`);
  assert.equal(run('state.stats.ability'),70+run('expected.ability'));
  assert.equal(run('state.stats.academy'),60+run('expected.academy'));
  assert.equal(run('JSON.stringify(state)===once'),true);
  assert.equal(run('Object.values(duplicate.growth).every(v=>v===0)'),true);
});

test('military years and interrupted injury years do not advance completed school-year count; transfers preserve its progress', () => {
  const {run}=game(101);
  run(`state.militaryYearsTotal=2;state.militaryYearsRemaining=2;serviceYear();serviceYear();serviceYear();`);
  assert.equal(run('state.completedCampusYears'),0);
  run('state.repeatYear=true;yearEnd();');
  assert.equal(run('state.completedCampusYears'),0);
  run(`state.repeatYear=false;state.completedCampusYears=2;state.year=1;
    assignTransferCollege(state,true);yearEnd();state.calendarYear++;state.year=1;yearEnd();`);
  assert.equal(run('state.completedCampusYears'),4);
});

test('completed school-year count persists in saves and older saves infer school years without military time', () => {
  const {run}=game(111);
  run(`state.year=3;state.calendarYear=2031;state.flags.militaryServed=true;state.flags.transferExtended=true;
    const old={...state};delete old.completedCampusYears;delete old.lastSettledCampusYear;
    localStorage.setItem(SAVE_KEY,JSON.stringify({state:old}));loadGame();`);
  assert.equal(run('state.completedCampusYears'),4);
  run('yearEnd();saveGame();loadGame();const savedCount=state.completedCampusYears;yearEnd();');
  assert.equal(run('state.completedCampusYears'),run('savedCount'));
  run("assignTeam('甲组',GROUPS['甲组'][0]);");
  assert.equal(run('state.completedCampusYears'),0);
  assert.equal(run('state.lastSettledCampusYear'),null);
});

test('postgraduate years do not override natural growth results in either standard or easy mode', () => {
 for(const mode of ['full','easy']){
  const {run}=game(122);
  run(`state.gameMode=${JSON.stringify(mode)};state.completedCampusYears=4;state.path='读研';annualGrowth=()=>({ability:0,mentality:0,relation:0,academy:0});
    for(let year=4;year<10;year++){
      state.year=year;state.calendarYear=2026+year;if(year>=7)state.path='读博';
      state.stats.mentality=year%2?0:100;state.stats.relation=year%2?100:0;
      const before=JSON.stringify(state.stats);yearEnd();
      if(JSON.stringify(state.stats)!==before)throw new Error('Unexpected social override');
    }`);
  assert.equal(run('state.completedCampusYears'),10);
 }
});

test('all-rounder earned during a year survives annual settlement and save migration', () => {
  const {run}=game(132);
  run(`state.gameMode='fast';state.completedCampusYears=3;state.year=3;state.calendarYear=2029;
    state.stats={ability:85,mentality:79,relation:79,academy:85};
    showBetweenMatchEvent(heavyDefeatEvent(0,3),()=>{});
    state.statRemainders={ability:0,mentality:0,relation:0,academy:0};
    const ev={title:'测试沟通成果',desc:'',choices:[{text:'完成沟通',effect:{mentality:5,relation:5}}]};
    chooseOption(ev,0);`);
  assert.equal(run('state.achievements.all_rounder'),true);
  run('yearEnd();saveGame();loadGame();');
  assert.equal(run('state.achievements.all_rounder'),true);
});

test('year-end all-rounder checks preserve earned social values without hard limits', () => {
  const {run}=game(135);
  run(`state.year=3;state.calendarYear=2029;state.completedCampusYears=3;
    state.stats={ability:80,mentality:85,relation:85,academy:80};annualGrowth=()=>({ability:0,mentality:0,relation:0,academy:0});yearEnd();`);
  assert.equal(run('state.stats.mentality'),85);
  assert.equal(run('state.stats.relation'),85);
  assert.equal(run('state.achievements.all_rounder'),true);
});

test('achievement flips toggle both faces and accessible labels without awarding an achievement', () => {
  const {run}=game(140);
  run(`renderAchievements('summary','grid');let flipped=false;
    const card={dataset:{frontLabel:'未解锁成就，点击查看名称和解锁条件',revealLabel:'处子进球：生涯累计打入 1 球。再次点击翻回。'},
      classList:{toggle(){return flipped=!flipped;}},attributes:{},setAttribute(k,v){this.attributes[k]=v;}};
    toggleAchievementCard(card);`);
  assert.equal(run("card.attributes['aria-pressed']"),'true');
  assert.match(run("card.attributes['aria-label']"),/处子进球.*1 球/);
  assert.equal(run('Object.keys(state.achievements).length'),0);
  run('toggleAchievementCard(card);');
  assert.equal(run("card.attributes['aria-pressed']"),'false');
  assert.match(run("card.attributes['aria-label']"),/未解锁/);
  assert.match(run("document.getElementById('grid').innerHTML"),/data-ach-flip="first_goal"[\s\S]*ach-back/);
  assert.equal(typeof run("document.getElementById('grid').onclick"),'function');
});

test('all three entry buttons select the right mode and easy saves retain fast flow', () => {
  for(const [button,mode,fast] of [['btnStart','full',false],['btnStartFast','fast',true],['btnStartEasy','easy',true]]){
    const {run}=game(142);
    run(`document.getElementById(${JSON.stringify(button)}).onclick();saveGame();loadGame();`);
    assert.equal(run('state.gameMode'),mode);
    assert.equal(run('isFastMode()'),fast);
    assert.equal(run('isEasyMode()'),mode==='easy');
    assert.match(run("document.getElementById('pcTalent').textContent"),new RegExp(mode==='easy'?'简单版':mode==='fast'?'快速版':'标准版'));
    run('processQueue=()=>{};startYear();');
    assert.equal(run("queue.filter(x=>x.ev && x.ev.tag==='常规事件').length"),fast?4:8);
  }
});

test('easy mode previews and applies boosted gains with zero event stat penalties and respects caps', () => {
  const {run}=game(144);
  run(`state.gameMode='easy';state.stats={ability:90,mentality:60,relation:60,academy:99};
    const effects={ability:20,mentality:-50,relation:4,academy:20};
    const preview=JSON.stringify(balanceEffects(effects));const applied=JSON.stringify(applyStats(effects));`);
  assert.equal(run('preview'),run('applied'));
  assert.equal(run('state.stats.ability'),100);
  assert.equal(run('state.stats.mentality'),60);
  assert.equal(run('state.stats.relation'),66);
  assert.equal(run('state.stats.academy'),100);
  assert.equal(run("statEffectValue('ability',-10)"),0);
  run("state.gameMode='fast';");
  assert.ok(run("statEffectValue('ability',-10)")<0);
});

test('easy biological pharmacy cannot bypass penalty protection through direct mental drain', () => {
  const {run}=game(146);
  run(`assignTeam('同济组','药学院');state.flags.pharmacyTrack=BIO_PHARMACY;
    state.gameMode='easy';state.stats.academy=10;state.stats.mentality=30;`);
  assert.equal(run('bioPharmacyChoiceDrain()'),false);
  assert.equal(run('bioPharmacyBreakdown()'),false);
  assert.equal(run('state.stats.mentality'),30);
  run("state.gameMode='fast';");
  assert.equal(run('bioPharmacyChoiceDrain()'),true);
  assert.equal(run('bioPharmacyBreakdown()'),true);
});

test('easy mode preserves social gains throughout the career and keeps earned honors', () => {
  const {run}=game(148);
  run(`state.gameMode='easy';state.stats={ability:90,mentality:95,relation:95,academy:90};
    checkAchievements(state);yearEnd();`);
  assert.ok(run('state.stats.mentality>=95 && state.stats.relation>=95'));
  run('state.completedCampusYears=3;state.year=3;state.calendarYear=2029;yearEnd();saveGame();loadGame();');
  assert.ok(run('state.stats.mentality')>=95);
  assert.ok(run('state.stats.relation')>=95);
  assert.equal(run('state.achievements.all_rounder'),true);
});

test('easy tournaments preserve manual easter gifts, the promise and final continuation', () => {
  for(const eggIndex of [0,1]){
    const {run,nodes}=game(150+eggIndex);
    run(`state.gameMode='easy';rollEasterEgg=()=>EASTER_EVENTS[${eggIndex}];launchTournament('华工杯','player',()=>{});`);
    assert.equal(run("document.getElementById('evTitle').textContent"),'偶遇学长');
    nodes.get('evChoices').children[0].onclick();
    assert.equal(run(eggIndex===0?'state.flags.fruitBasket':'state.flags.trophyBlessing'),true);
    assert.equal(run('state.flags.worldCupPromise'),true);
    run("document.getElementById('easterNext').onclick();");
    finishAdjustments({run,nodes});
    assert.match(run("document.getElementById('mHeader').innerHTML"),/赛事收官/);
  }
});

test('social natural growth moves toward maturity gradually and leaves outliers outside the old bands', () => {
  for(const mode of ['full','fast'])for(const value of [20,100]){
    const {run}=game(160);
    run(`state.gameMode=${JSON.stringify(mode)};state.year=3;state.calendarYear=2029;state.completedCampusYears=3;
      state.stats.mentality=${value};state.stats.relation=${value};yearEnd();`);
    const mentality=run('state.stats.mentality'),relation=run('state.stats.relation');
    if(value===20){assert.ok(mentality>20&&mentality<78);assert.ok(relation>20&&relation<70);}
    else{assert.ok(mentality>82&&mentality<100);assert.ok(relation>80&&relation<100);}
    assert.match(run("document.getElementById('yrTable').innerHTML"),value===20?/假期休整.*假期交流/s:/假期状态回落.*假期联系减少/s);
    assert.match(run("document.getElementById('yrTable').innerHTML"),/队友分散离校/);
    assert.match(run('JSON.stringify(state.log)'),/假期休整与联系变化/);
  }
  const {run}=game(161);
  run("state.gameMode='easy';state.stats.mentality=100;state.stats.relation=100;yearEnd();");
  assert.equal(run('state.stats.mentality'),100);
  assert.equal(run('state.stats.relation'),100);
  assert.doesNotMatch(run("document.getElementById('yrTable').innerHTML"),/假期状态回落|假期联系减少/);
});

test('goalkeeper and defender base goal expectations are much lower even with perfect stats', () => {
  const {run}=game(162);
  run('state.stats={ability:100,mentality:100,relation:100,academy:100};state.squadRole="首发";');
  const rates={};
  for(const pos of ['前锋','中场','后卫','门将']){run(`state.position=${JSON.stringify(pos)};`);rates[pos]=run('playerGoalExpectation()');}
  assert.ok(rates['门将']<.005);
  assert.ok(rates['门将']<rates['后卫']*.05);
  assert.ok(rates['后卫']<.15&&rates['后卫']<rates['中场']*.3);
  assert.equal(run('poisson(0)'),0);
  run('let tinyGoals=0;for(let i=0;i<20000;i++)tinyGoals+=poisson(.002);');
  assert.ok(run('tinyGoals')<100,'rare goals must not be inflated by the former 0.01 Poisson floor');
});

test('position scoring reductions cover event shots without weakening teammate goals or defensive actions', () => {
  const {run}=game(164);
  run(`state.stats={ability:60,mentality:60,relation:60,academy:60};Math.random=()=>.5;
    const shot={prob:.8,stat:'ability',mGood:{goal:1,playerGoal:true},mBad:{}};
    const assist={prob:.8,stat:'ability',mGood:{goal:1},mBad:{}};`);
  for(const pos of ['门将','后卫']){
    run(`state.position=${JSON.stringify(pos)};`);
    assert.equal(run('rollMatchChoice(shot).success'),false);
    assert.equal(run('rollMatchChoice(assist).success'),true);
  }
  for(const pos of ['前锋','中场']){
    run(`state.position=${JSON.stringify(pos)};`);
    assert.equal(run('rollMatchChoice(shot).success'),true);
  }
});

test('goalkeeper defense grows above 70, scales substitutes, and excludes absent, coach and other fixtures', () => {
  const {run}=game(170);
  run(`state.position='门将';state.squadRole='首发';
    tourney={role:'player',currentMatch:{home:state.team.name,away:'对手'}};`);
  for(const [ability,factor] of [[40,1],[70,1],[85,.75],[100,.5]]){
    run(`state.stats.ability=${ability};`);
    assert.equal(run('goalkeeperConcedeFactor()'),factor);
  }
  run("state.squadRole='替补';");
  assert.equal(run('goalkeeperConcedeFactor()'),.675);
  for(const change of ["tourney.playerUnavailable=true;","tourney.role='coach';", "state.position='后卫';", "tourney.currentMatch={home:'其他队1',away:'其他队2'};"]){
    run(`state.position='门将';tourney.role='player';tourney.playerUnavailable=false;
      tourney.currentMatch={home:state.team.name,away:'对手'};${change}`);
    assert.equal(run('goalkeeperConcedeFactor()'),1);
  }
});

test('keeper defense lowers opponent base goal probability on either side in all modes', () => {
  for(const mode of ['full','fast','easy'])for(const home of [true,false]){
    const {run}=game(171);
    run(`state.position='门将';state.squadRole='首发';state.stats.ability=100;state.gameMode='${mode}';
      tourney={role:'player',minuteCap:60};teamStrength=()=>60;poisson=lambda=>lambda;
      const match={home:${home?'state.team.name':"'对手'"},away:${home?"'对手'":'state.team.name'}};
      prepareMatch(match,false);`);
    assert.equal(run(home?'tourney.baseAway':'tourney.baseHome'),1.35*.5);
    assert.equal(run(home?'tourney.baseHome':'tourney.baseAway'),1.35);
    run('prepareMatch(match,false,true);');
    assert.equal(run(home?'tourney.baseAway':'tourney.baseHome'),1.35);
  }
  const {run}=game(172);
  run(`let ordinaryGoals=0,keeperGoals=0,ordinaryConceding=0,keeperConceding=0;
    for(let i=0;i<10000;i++){
      const ordinary=simulateBaseScore(60,60).b,keeper=simulateBaseScore(60,60,.5,1).b;
      ordinaryGoals+=ordinary;keeperGoals+=keeper;
      ordinaryConceding+=ordinary>0;keeperConceding+=keeper>0;
    }`);
  assert.ok(run('keeperGoals/ordinaryGoals')>.45&&run('keeperGoals/ordinaryGoals')<.55);
  assert.ok(run('keeperConceding/ordinaryConceding')<.75);
  assert.ok(run('keeperGoals')>0,'high ability still permits goals conceded');
});

test('high keeper saves event shots with consistent text and without changing shared event definitions', () => {
  const {run}=game(173);
  run(`state.position='门将';tourney={keeperConcedeFactor:.5};
    const choice={prob:.1,mBad:{conc:1,injuryRisk:.1},badText:'你失误了，球队失球。'};
    Math.random=()=>.8;const saved=rollMatchChoice(choice);`);
  assert.equal(run('saved.success'),false);
  assert.equal(run('saved.m.conc'),0);
  assert.equal(run('saved.m.injuryRisk'),.1);
  assert.equal(run('choice.mBad.conc'),1);
  assert.match(run('saved.text'),/扑出.*化解/);
  assert.doesNotMatch(run('saved.text'),/球队失球/);
  run('tourney.keeperConcedeFactor=1;const unsaved=rollMatchChoice(choice);');
  assert.equal(run('unsaved.m.conc'),1);
  assert.equal(run('unsaved.text'),'你失误了，球队失球。');
});

test('keeper cup record counts the whole team including absence, ignores other teams, and counts each fixture once', () => {
  const {run}=game(174);
  run(`state.position='门将';tourney={role:'player',stage:'group'};
    const home={home:state.team.name,away:'甲队'},away={home:'乙队',away:state.team.name};
    recordGoalkeeperMatch(tourney,home,1);recordGoalkeeperMatch(tourney,home,1);
    tourney.playerUnavailable=true;recordGoalkeeperMatch(tourney,away,2);
    recordGoalkeeperMatch(tourney,{home:'丙队',away:'丁队'},8);`);
  assert.equal(run('tourney.keeperRecord.conceded'),3);
  assert.equal(run('tourney.keeperRecord.appearances'),1);
  assert.equal(run('awardGoldenGlove(tourney)'),false);
});

test('golden glove includes final goals, admits runners-up, and excludes penalty shootouts', () => {
  for(const home of [true,false])for(const win of [true,false])for(const total of [0,2,3]){
    const {run}=game(175);
    run(`state.position='门将';rollMatchInjury=()=>{};
      const fixture={home:${home?'state.team.name':"'对手'"},away:${home?"'对手'":'state.team.name'}};
      tourney={type:'毕业杯',role:'player',league:'毕业杯',stage:'knockout',minuteCap:60,
        knockoutRounds:[[],[],[fixture]],koRoundIdx:2,playerGoals:0,
        keeperRecord:{conceded:${total===0?0:1},appearances:2,finalPlayed:false}};
      prepareMatch(fixture,true);
      tourney.baseHome=${home?(win?3:0):(total===0?0:total-1)};
      tourney.baseAway=${home?(total===0?0:total-1):(win?3:0)};
      penaltyShootout=()=>({win:${home?win:!win},took:false,scored:false});
      finishMatch();tourney.myFinish='决赛';finishTournament();`);
    assert.equal(run('tourney.keeperRecord.conceded'),total);
    assert.equal(run('tourney.keeperRecord.finalPlayed'),true);
    assert.equal(run('!!state.achievements.golden_glove'),total<=2);
    assert.match(run("document.getElementById('mBody').innerHTML"),/累计丢球.*不含点球大战/);
    if(!win)assert.match(run("document.getElementById('mHeader').innerHTML"),/亚军/);
  }
});

test('golden glove requires a final and actual goalkeeper appearances, and never counts coaching or an earlier cup', () => {
  for(const change of ["state.position='前锋';", "tourney.role='coach';", "tourney.keeperRecord.finalPlayed=false;", "tourney.keeperRecord.appearances=0;", "tourney.keeperRecord.conceded=3;"]){
    const {run}=game(176);
    run(`state.position='门将';tourney={type:'华工杯',role:'player',keeperRecord:{conceded:2,appearances:1,finalPlayed:true}};${change}`);
    assert.equal(run('awardGoldenGlove(tourney)'),false);
    assert.equal(run('state.flags.goldenGlove'),false);
  }
  const {run}=game(177);
  run("state.position='门将';launchTournament('新生杯','player');tourney.keeperRecord.conceded=2;launchTournament('毕业杯','player');");
  assert.equal(run('tourney.keeperRecord.conceded'),0);
  assert.equal(run('tourney.keeperRecord.appearances'),0);
  assert.equal(run('tourney.keeperRecord.finalPlayed'),false);
});

test('Super Cup counts both rounds and grants golden glove after a lost final', () => {
  const {run}=game(178);
  run(`state.position='门将';rollMatchInjury=()=>{};
    state.seasonChampions={yi:state.team.name,tongji:'医学队',jia:'甲组队'};
    launchSuperCup(false);
    prepareMatch({home:state.team.name,away:'医学队'},true);
    tourney.baseHome=3;tourney.baseAway=1;finishMatch();afterSuperMatch();
    prepareMatch({home:state.team.name,away:'甲组队'},true);
    tourney.baseHome=0;tourney.baseAway=1;finishMatch();afterSuperMatch();`);
  assert.equal(run('tourney.keeperRecord.conceded'),2);
  assert.equal(run('state.flags.superCupChampion'),false);
  assert.equal(run('state.achievements.golden_glove'),true);
  assert.match(run("document.getElementById('mBody').innerHTML"),/金手套/);
});

test('golden glove survives saves and history; old saves and a new career start unearned', () => {
  const {run}=game(179);
  run(`state.position='门将';tourney={type:'华工杯',role:'player',keeperRecord:{conceded:2,appearances:4,finalPlayed:true}};
    awardGoldenGlove(tourney);checkAchievements(state);saveGame();state.flags.goldenGlove=false;state.achievements={};loadGame();`);
  assert.equal(run('state.achievements.golden_glove'),true);
  assert.equal(run('state.flags.goldenGlove'),true);
  run(`inheritAchievements();const old=JSON.parse(localStorage.getItem(SAVE_KEY));delete old.state.flags.goldenGlove;
    delete old.state.achievements.golden_glove;localStorage.setItem(SAVE_KEY,JSON.stringify(old));loadGame();`);
  assert.equal(run('state.flags.goldenGlove'),false);
  assert.equal(run('!!state.achievements.golden_glove'),false);
  run("assignTeam('甲组',GROUPS['甲组'][0]);");
  assert.equal(run('state.flags.goldenGlove'),false);
  assert.equal(run('loadInheritedAchievements().golden_glove'),true);
  assert.equal(run('ACHIEVEMENTS.length'),31);
});

test('end-of-year failure is mandatory below 60 in all modes, and 60 is not failing', () => {
  for(const mode of ['full','fast','easy'])for(const academy of [59,60]){
    const {run,nodes}=game(190);
    run(`state.gameMode='${mode}';state.stats.academy=${academy};
      annualGrowth=()=>({ability:0,mentality:0,relation:0,academy:0});yearEnd();`);
    if(academy<60){
      assert.equal(run("document.getElementById('evTitle').textContent"),'你能做的，岂止如此');
      assert.equal(nodes.get('evChoices').children.length,3);
      assert.equal(run('current.timeScale'),undefined);
      assert.equal(run('state.completedCampusYears'),1);
    }else{
      assert.match(run("document.getElementById('yrTitle').textContent"),/学年结算/);
      assert.notEqual(run("document.getElementById('evTitle').textContent"),'你能做的，岂止如此');
    }
  }
});

test('failure checks settled academy, resumes the same growth summary and never applies annual growth twice', () => {
  const {run,nodes}=game(191);
  run(`state.stats.academy=57;annualGrowth=()=>({ability:2,mentality:-1,relation:1,academy:2});yearEnd();`);
  assert.equal(run('state.stats.academy'),58);
  nodes.get('evChoices').children[0].onclick();
  run("document.getElementById('btnNext').onclick();");
  assert.equal(run('state.completedCampusYears'),1);
  assert.equal(run('state.lastAcademicFailureYear'),2026);
  assert.match(run("document.getElementById('yrTable').innerHTML"),/学业值 自然成长<\/td><td[^>]*>\+1</);
  assert.equal(run("state.log.filter(e=>JSON.stringify(e).includes('学年结算 ·')).length"),1);
  const passing=game(192);
  passing.run('state.stats.academy=59;annualGrowth=()=>({academy:2});yearEnd();');
  assert.equal(passing.run('state.stats.academy'),60);
  assert.notEqual(passing.run("document.getElementById('evTitle').textContent"),'你能做的，岂止如此');
});

test('failure continues into graduation and postgraduate years, while service and interrupted years are excluded', () => {
  for(const [path,year,final] of [['就业',3,true],['读研',4,false],['读研',6,true],['直博',7,true]]){
    const {run,nodes}=game(193);
    run(`state.path='${path}';state.year=${year};state.stats.academy=50;
      annualGrowth=()=>({ability:0,mentality:0,relation:0,academy:0});yearEnd();`);
    assert.equal(run("document.getElementById('evTitle').textContent"),'你能做的，岂止如此');
    nodes.get('evChoices').children[1].onclick();run("document.getElementById('btnNext').onclick();");
    assert.equal(run("document.getElementById('btnYearEnd').textContent"),final?'查看结局':'进入下一年');
  }
  const {run}=game(194);
  run('state.stats.academy=30;state.militaryYearsRemaining=2;serviceYear();state.repeatYear=true;yearEnd();');
  assert.equal(run('state.completedCampusYears'),0);
  assert.notEqual(run("document.getElementById('evTitle').textContent"),'你能做的，岂止如此');
});

test('failure is handled once per calendar year, persists in saves, and resets for old saves and new careers', () => {
  const {run,nodes}=game(195);
  run('state.stats.academy=50;annualGrowth=()=>({ability:0,mentality:0,relation:0,academy:0});yearEnd();');
  nodes.get('evChoices').children[2].onclick();run("document.getElementById('btnNext').onclick();saveGame();loadGame();");
  assert.equal(run('academicFailureEvent(state)'),null);
  assert.equal(run('state.lastAcademicFailureYear'),2026);
  run('state.calendarYear++;yearEnd();');
  assert.equal(run('current.id'),'year_end_academic_failure');
  run(`const old=JSON.parse(localStorage.getItem(SAVE_KEY));delete old.state.lastAcademicFailureYear;
    localStorage.setItem(SAVE_KEY,JSON.stringify(old));loadGame();`);
  assert.equal(run('state.lastAcademicFailureYear'),null);
  run("state.lastAcademicFailureYear=2026;assignTeam('甲组',GROUPS['甲组'][0]);");
  assert.equal(run('state.lastAcademicFailureYear'),null);
});

test('year-end failure remains manual in easy mode and reveal preserves continuation with protected penalties', () => {
  const {run,nodes}=game(196);
  run(`state.gameMode='easy';state.stats={ability:70,mentality:70,relation:70,academy:50};
    annualGrowth=()=>({ability:0,mentality:0,relation:0,academy:0});yearEnd();setupRevealToggle();
    document.getElementById('revealChoices').checked=true;document.getElementById('revealChoices').onchange();`);
  assert.equal(run('state.lastAcademicFailureYear'),null);
  nodes.get('evChoices').children[0].onclick();run("document.getElementById('btnNext').onclick();");
  assert.equal(run('state.stats.academy'),59);
  assert.equal(run('state.stats.ability'),70);
  assert.equal(run('state.stats.mentality'),70);
  assert.equal(run('state.stats.relation'),70);
  assert.equal(run('academicFailureEvent(state)'),null);
  assert.match(run("document.getElementById('yrTitle').textContent"),/学年结算/);
  assert.equal(run('state.completedCampusYears'),1);
});
