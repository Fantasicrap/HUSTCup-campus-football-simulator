const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const baseline=process.env.BASELINE_HTML||null;
function simulate(file,seed,config){
  const script=fs.readFileSync(file,'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const nodes=new Map(),storage=new Map();
  const element=()=>({style:{},classList:{add(){},remove(){}},children:[],set innerHTML(v){this.html=v;this.children=[];},get innerHTML(){return this.html||'';},appendChild(c){this.children.push(c);},addEventListener(){}});
  const ctx=vm.createContext({document:{getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},querySelectorAll(){return[];},createElement:element},console,setTimeout(){},clearTimeout(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  vm.runInContext(script.slice(0,script.lastIndexOf('\nsetupRevealToggle();')),ctx);
  vm.runInContext(`let rng=${seed};Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
    const config=${JSON.stringify(config)};
    state.name='难度测试';state.position=config.position||'前锋';assignTeam(config.league,config.college||GROUPS[config.league][(rng-1)%GROUPS[config.league].length]);state.gameMode=config.mode;
    let screen='scr-main',modal=null,waiting=null,iterations=0;
    const realShow=show;show=id=>{screen=id;realShow(id);};
    for(const name of ['renderEvent','renderMedicalStream','showBetweenMatchEvent','showEasterEgg']){
      const original=eval(name);eval(name+'=(ev,...args)=>{modal=ev;waiting=null;return original(ev,...args);};');
    }
    const originalResult=showResult;showResult=(...args)=>{waiting='btnNext';originalResult(...args);};
    renderMatchModeChoice=(match,isKey)=>simulateMatch(match,isKey,!!playerUnavailableReason(tourney.role));
    // Remove display animation only; preserve roll, effects, medical drain and achievement checks.
    animateResult=(roll,drained)=>{const actual=applyStats(roll.effects);checkAchievements(state);if(!bioPharmacyBreakdown())showResult(roll.text,actual,0,lowAcademyTipHTML(drained));};
    function auditPick(ev){
      const available=ev.choices.map((c,i)=>({c,i})).filter(x=>!x.c.cond||x.c.cond(state));
      const find=re=>available.find(x=>re.test(x.c.text));
      let special;
      if(ev.title==='足协招新')special=find(config.referee?/加入裁判部/:/继续专注球员/);
      else if(ev.title==='保留学籍 · 参军服役')special=find(config.long?/服役/:/留在校园/);
      else if(ev.title==='转专业考试')special=find(config.long&&state.year===1&&!state.flags.transferExtended?/参加/:/暂不参加/);
      else if(ev.title==='升学抉择')special=config.long?(find(/保研本校/)||find(/^考研$/)):find(/直接就业/);
      else if(ev.title==='读博抉择')special=find(/继续读博/);
      else if(ev.title==='药学专业分流')special=find(/临床药学/);
      else if(ev.title==='医学分流')special=find(/第一临床学院/);
      else if(ev.title==='职业队试训')special=find(/参加试训/);
      else if(ev.title==='队长竞选')special=find(/参选/);
      else if(ev.title==='队长换届')special=find(/连任|继续担任/);
      else if(/裁判班$/.test(ev.title))special=find(/参加.*裁判班/);
      else if(ev.title==='决赛裁判')special=find(/接下主裁/);
      else if(ev.title==='偶遇学长')special=find(/果篮|奖杯/);
      else if(ev.id==='varsity_tryout')special=find(/全力争取/);
      else if(ev.stayUpChain)special=available.find(x=>x.c.pushHard);
      else if(available.some(x=>x.c.stayUp))special=available.find(x=>x.c.stayUp);
      else if(config.risky&&available.some(x=>x.c.ignoreDoctor))special=available.find(x=>x.c.ignoreDoctor);
      if(special)return special.i;
      const weights=config.policy==='study'?{ability:.15,mentality:.1,relation:.1,academy:1}:config.policy==='football'?{ability:1,mentality:.35,relation:.4,academy:.15}:{ability:state.stats.ability<80?1:.2,mentality:state.stats.mentality<80?1:.1,relation:state.stats.relation<80?1.5:.1,academy:state.stats.academy<80?1:.2};
      return available.map(x=>{
        const c=x.c,{p,scale}=choiceRollParams(c),time=ev.timeScale||1;
        const good=balanceEffects(scaledEffects(c.good||c.effect||{},scale*time)),bad=balanceEffects(scaledEffects(c.bad||c.effect||{},scale*time));
        const score=Object.keys(weights).reduce((sum,k)=>sum+weights[k]*(p*(good[k]||0)+(1-p)*(bad[k]||0)),0)+(config.referee&&c.onSuccess&&/refereeMatches/.test(String(c.onSuccess))?4:0);
        return {...x,score};
      }).sort((a,b)=>b.score-a.score)[0].i;
    }
    while(screen!=='scr-ending'&&iterations++<1600){
      if(screen==='scr-main')startYear();
      else if(screen==='scr-year')document.getElementById('btnYearEnd').onclick();
      else if(screen==='scr-match'){
        if(document.getElementById('mBtn2').style.display!=='none'&&/模拟/.test(document.getElementById('mBtn2').textContent||''))document.getElementById('mBtn2').onclick();
        else document.getElementById('mBtn1').onclick();
      }else if(screen==='scr-medical-stream'){
        if(waiting){const id=waiting;waiting=null;document.getElementById(id).onclick();}
        else {resolveMedicalStream(modal,auditPick(modal));waiting='medicalStreamNext';}
      }else if(screen==='scr-event'){
        if(waiting){const id=waiting;waiting=null;document.getElementById(id).onclick();}
        else {
          const index=auditPick(modal);document.getElementById('evChoices').children[index].onclick();
          if(!waiting&&screen==='scr-event')waiting=modal.title==='偶遇学长'?'easterNext':'betweenNext';
        }
      }else throw new Error('Unexpected screen '+screen);
    }
    if(screen!=='scr-ending')throw new Error('Career stuck '+screen+' '+(modal&&modal.title));
    checkAchievements(state);
  `,ctx,{timeout:20000});
  return JSON.parse(vm.runInContext('JSON.stringify({stats:state.stats,achievements:state.achievements,year:state.year,calendar:state.calendarYear,path:state.path,goals:state.careerGoals,refereeMatches:state.refereeMatches,iterations})',ctx));
}
const configs=[
  ...['full','fast'].flatMap(mode=>['study','football','balanced'].map(policy=>({id:mode+'-'+policy,mode,policy,league:'甲组'}))),
  {id:'fast-yi',mode:'fast',policy:'football',league:'乙组'},
  {id:'fast-medical',mode:'fast',policy:'study',league:'同济组',college:'基础医学院'},
  {id:'fast-gk',mode:'fast',policy:'football',league:'甲组',position:'门将'},
  {id:'full-gk',mode:'full',policy:'football',league:'甲组',position:'门将'},
  {id:'full-defender',mode:'full',policy:'football',league:'甲组',position:'后卫'},
  {id:'fast-defender',mode:'fast',policy:'football',league:'甲组',position:'后卫'},
  {id:'fast-referee',mode:'fast',policy:'football',league:'甲组',referee:true},
  {id:'fast-long',mode:'fast',policy:'balanced',league:'乙组',long:true,risky:true},
  {id:'fast-long-referee',mode:'fast',policy:'balanced',league:'乙组',long:true,referee:true,risky:true},
  ...['study','football','balanced'].map(policy=>({id:'easy-'+policy,mode:'easy',policy,league:'甲组'})),
  {id:'easy-yi',mode:'easy',policy:'football',league:'乙组'},
  {id:'easy-medical',mode:'easy',policy:'study',league:'同济组',college:'基础医学院'},
  {id:'easy-gk',mode:'easy',policy:'football',league:'甲组',position:'门将'},
  {id:'easy-defender',mode:'easy',policy:'football',league:'甲组',position:'后卫'},
  {id:'easy-referee',mode:'easy',policy:'football',league:'甲组',referee:true},
  {id:'easy-long',mode:'easy',policy:'balanced',league:'乙组',long:true,risky:true},
  {id:'easy-long-referee',mode:'easy',policy:'balanced',league:'乙组',long:true,referee:true,risky:true}
];
const n=Number(process.env.AUDIT_SAMPLES||100),report={samplesPerConfig:n,scenarios:[],failures:[]};
const achievementSource=fs.readFileSync(path.join(root,'index.html'),'utf8').split('const ACHIEVEMENTS = [')[1].split('function checkAchievements')[0];
report.achievements=[...achievementSource.matchAll(/id:'([^']+)'.*?name:'([^']+)'.*?desc:'([^']+)'/g)].map(m=>({id:m[1],name:m[2],desc:m[3]}));
for(const config of configs){
  if(process.env.AUDIT_MODES && !process.env.AUDIT_MODES.split(',').includes(config.mode))continue;
  const versions=baseline&&fs.existsSync(baseline)&&config.id.startsWith('full-')?['baseline','current']:['current'];
  for(const version of versions){
    const counts=Object.fromEntries(report.achievements.map(a=>[a.id,0])),stats={ability:0,mentality:0,relation:0,academy:0};let completed=0,longest=0,goals=0;
    const socialValues={mentality:[],relation:[]};
    for(let seed=1;seed<=n;seed++){
      try{
        const result=simulate(version==='baseline'?baseline:path.join(root,'index.html'),seed,config);completed++;longest=Math.max(longest,result.calendar-2026+1);goals+=result.goals;
        for(const k of Object.keys(socialValues))socialValues[k].push(result.stats[k]);
        for(const id of Object.keys(counts))if(result.achievements[id])counts[id]++;
        for(const k of Object.keys(stats))stats[k]+=result.stats[k];
      }catch(e){report.failures.push({version,scenario:config.id,seed,error:e.message});if(report.failures.length>5)throw e;}
    }
    const distribution=Object.fromEntries(Object.entries(socialValues).map(([k,values])=>{values.sort((a,b)=>a-b);return[k,{min:values[0],p10:values[Math.floor(values.length*.1)],median:values[Math.floor(values.length*.5)],p90:values[Math.floor(values.length*.9)],max:values.at(-1)}];}));
    const scenario={version,...config,completed,longest,averageGoals:+(goals/completed).toFixed(2),averageStats:Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,+(v/completed).toFixed(1)])),socialDistribution:distribution,rates:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,+(v*100/completed).toFixed(1)]))};
    report.scenarios.push(scenario);console.log(JSON.stringify(scenario));
  }
}
fs.writeFileSync(process.env.AUDIT_OUTPUT||path.join(root,'ACHIEVEMENT_DIFFICULTY_DATA.json'),JSON.stringify(report,null,2));
if(report.failures.length){console.error(report.failures);process.exitCode=1;}
