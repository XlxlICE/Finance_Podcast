
import React, { useState, useEffect, useRef } from 'react';
import { WorkflowStep, PodcastContent } from './types';
import { STEPS_CONFIG } from './constants';
import * as gemini from './services/geminiService';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(WorkflowStep.IDLE);
  const [keyword, setKeyword] = useState('');
  const [content, setContent] = useState<PodcastContent>({ keyword: '' });
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'script' | 'process' | 'sources'>('script');
  const [trending, setTrending] = useState<Record<string, string[]>>({ ths: [], xq: [], dfcf: [] });
  const [newsEvents, setNewsEvents] = useState<{title: string, summary: string}[]>([]);
  const [executionLogs, setExecutionLogs] = useState<{msg: string, type: 'info' | 'success' | 'working' | 'error'}[]>([]);
  const [synthesisProgress, setSynthesisProgress] = useState({ current: 0, total: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(new Date());
  const [errorOccurred, setErrorOccurred] = useState(false);

  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const startTimeRef = useRef<number>(0);
  const offsetRef = useRef<number>(0);
  const rafIdRef = useRef<number>(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gemini.fetchTrendingTopics().then(setTrending);
    gemini.fetchFinancialEvents().then(setNewsEvents);
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [executionLogs]);

  const addLog = (msg: string, type: 'info' | 'success' | 'working' | 'error' = 'info') => {
    setExecutionLogs(prev => [...prev, { msg, type }]);
  };

  const startWorkflow = async (target?: string) => {
    const k = target || keyword;
    if (!k) return;
    setKeyword(k);
    setErrorOccurred(false);
    setCurrentStep(WorkflowStep.RESEARCH);
    setContent({ keyword: k });
    setExecutionLogs([{ msg: `启动 "${k}" 深度生产链路...`, type: 'info' }]);

    try {
      if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      
      // Step 1: Research with Deep Dive
      addLog("正在穿透搜索各大平台音视频摘要与机构研报...", "working");
      const res = await gemini.collectMaterials(k, (msg) => addLog(msg, "working"));
      setContent(prev => ({ 
        ...prev, 
        materials: res.materialJson, 
        groundingLinks: res.links 
      }));
      addLog(`多模态素材搜集完成，识别到 ${res.links.length} 个数据源。`, "success");

      // Step 2: Insights
      setCurrentStep(WorkflowStep.INSIGHTS);
      addLog("正在进行反常识洞察提取与金句逻辑设计...", "working");
      const meta = await gemini.generateHighlightsAndHooks(k, res.materialJson);
      setContent(prev => ({ ...prev, hooks: meta.hooks, highlights: meta.highlights }));
      addLog("爆点设计完成。", "success");

      // Step 3: Outline
      setCurrentStep(WorkflowStep.OUTLINE);
      addLog("构建逻辑因果链大纲...", "working");
      const outline = await gemini.generateOutline(k, res.materialJson);
      const title = await gemini.generateEpisodeTitle(k, meta.hooks || []);
      setContent(prev => ({ ...prev, outline, title }));
      addLog(`标题定稿：${title}`, "success");

      // Step 4: Drafting
      setCurrentStep(WorkflowStep.DRAFTING);
      addLog("正在撰写长时深度对话脚本（预计 2000+ 字）...", "working");
      const script = await gemini.generateScript(k, res.materialJson, outline);
      setContent(prev => ({ ...prev, finalScript: script }));
      addLog("对话脚本撰写完成。", "success");

      // Step 5: Synthesis
      setCurrentStep(WorkflowStep.SYNTHESIS);
      addLog("正在合成高清多角色音频播客...", "working");
      const buffer = await gemini.synthesizePodcast(script, audioContextRef.current, (c, t) => {
        setSynthesisProgress({ current: c, total: t });
      });
      setDuration(buffer.duration);
      setContent(prev => ({ ...prev, audioBuffer: buffer }));
      addLog("音频全链路生产圆满完成！", "success");
      setCurrentStep(WorkflowStep.COMPLETED);

    } catch (e: any) {
      console.error(e);
      const errMsg = e.message || "未知错误";
      addLog(`生成中断: ${errMsg}`, "error");
      setErrorOccurred(true);
    }
  };

  const togglePlayback = () => {
    if (!content.audioBuffer || !audioContextRef.current) return;
    if (isPlaying) {
      offsetRef.current += (audioContextRef.current.currentTime - startTimeRef.current);
      audioSourceRef.current?.stop();
      setIsPlaying(false);
      cancelAnimationFrame(rafIdRef.current);
    } else {
      const source = audioContextRef.current.createBufferSource();
      source.buffer = content.audioBuffer;
      source.connect(audioContextRef.current.destination);
      startTimeRef.current = audioContextRef.current.currentTime;
      source.start(0, offsetRef.current);
      audioSourceRef.current = source;
      setIsPlaying(true);
      const update = () => {
        const cur = offsetRef.current + (audioContextRef.current!.currentTime - startTimeRef.current);
        setCurrentTime(cur);
        if (cur >= duration) {
          setIsPlaying(false);
          offsetRef.current = 0;
        }
        else rafIdRef.current = requestAnimationFrame(update);
      };
      rafIdRef.current = requestAnimationFrame(update);
    }
  };

  const getStepProgress = () => {
    if (currentStep === WorkflowStep.IDLE) return 0;
    if (currentStep === WorkflowStep.COMPLETED) return 100;
    const index = STEPS_CONFIG.findIndex(s => s.step === currentStep);
    return Math.max(5, ((index + 1) / STEPS_CONFIG.length) * 100);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 p-6 md:p-12 font-sans selection:bg-blue-500/30">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-end mb-12 border-b border-slate-800 pb-8">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-600/20 transform rotate-3">
              <i className="fa-solid fa-podcast text-white text-2xl"></i>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter uppercase leading-none">FinancePod <span className="text-blue-500">PRO</span></h1>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-[0.3em] mt-2">Smart Audio Production Hub</p>
            </div>
          </div>
          <div className="text-right flex flex-col items-end">
            <div className="flex items-center gap-4">
              <span className="text-3xl font-mono font-bold text-white leading-none tracking-tighter">
                {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-bold uppercase mt-2 tracking-widest">
              {time.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
            </span>
          </div>
        </header>

        {currentStep === WorkflowStep.IDLE ? (
          <div className="max-w-6xl mx-auto mt-12 animate-in fade-in duration-1000">
            <div className="text-center mb-16">
              <h2 className="text-6xl font-black text-white mb-8 tracking-tighter leading-tight">洞察市场，声临其境</h2>
              <div className="max-w-3xl mx-auto relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-[2.5rem] blur opacity-25 group-hover:opacity-60 transition duration-1000"></div>
                <div className="relative flex bg-slate-900 border border-slate-700 rounded-[2.5rem] p-2">
                  <input 
                    value={keyword} 
                    onChange={e => setKeyword(e.target.value)} 
                    className="flex-1 bg-transparent px-8 py-4 outline-none text-xl font-medium placeholder:text-slate-600" 
                    placeholder="输入个股、产业或宏观热词开启全链路生成..." 
                    onKeyDown={(e) => e.key === 'Enter' && startWorkflow()}
                  />
                  <button onClick={() => startWorkflow()} className="bg-blue-600 hover:bg-blue-500 px-12 rounded-[1.8rem] font-black text-white transition-all transform active:scale-95 shadow-lg shadow-blue-600/40">
                    开启生产
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-[2.5rem] p-8 mb-16 overflow-hidden relative">
               <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-slate-900 to-transparent z-10 pointer-events-none"></div>
               <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-slate-900 to-transparent z-10 pointer-events-none"></div>
               <div className="flex gap-12 items-center">
                  <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-blue-600/10 border border-blue-500/20 rounded-xl z-20">
                    <i className="fa-solid fa-newspaper text-blue-400"></i>
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">A股要闻</span>
                  </div>
                  <div className="flex-1 flex gap-16 overflow-x-auto whitespace-nowrap scrollbar-hide py-2 z-0 animate-marquee">
                    {newsEvents.length > 0 ? [...newsEvents, ...newsEvents].map((e, i) => (
                      <div key={i} className="flex items-center gap-4 min-w-[300px] group">
                        <span className="text-sm font-black text-slate-100 group-hover:text-blue-400 transition-colors">{e.title}</span>
                        <span className="text-xs text-slate-500 font-medium truncate">{e.summary}</span>
                        <div className="w-1 h-1 bg-slate-800 rounded-full mx-4"></div>
                      </div>
                    )) : <span className="text-sm text-slate-600">正在追踪实时财经大事...</span>}
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { key: 'ths', name: '同花顺热榜', icon: 'fa-chart-line', color: 'text-orange-500', bg: 'bg-orange-500/5' },
                { key: 'xq', name: '雪球讨论榜', icon: 'fa-snowflake', color: 'text-blue-400', bg: 'bg-blue-400/5' },
                { key: 'dfcf', name: '东财人气榜', icon: 'fa-fire', color: 'text-red-500', bg: 'bg-red-500/5' }
              ].map((source) => (
                <div key={source.key} className="bg-slate-900/30 border border-slate-800/80 rounded-[2.5rem] p-8 hover:border-slate-700 transition-all flex flex-col h-full">
                  <div className="flex items-center justify-between mb-8 px-2">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 ${source.bg} rounded-xl flex items-center justify-center`}>
                        <i className={`fa-solid ${source.icon} ${source.color} text-lg`}></i>
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{source.name}</h4>
                    </div>
                  </div>
                  <div className="space-y-4 flex-1">
                    {trending[source.key]?.map((t, i) => (
                      <button 
                        key={i} 
                        onClick={() => startWorkflow(t)}
                        className="w-full flex items-center justify-between p-5 bg-slate-900 hover:bg-blue-600/10 border border-slate-800/50 rounded-2xl group transition-all"
                      >
                        <div className="flex items-center gap-5">
                          <span className="text-[11px] font-mono text-slate-600 font-black">{i+1}</span>
                          <span className="text-sm font-bold text-slate-200 group-hover:text-blue-400 tracking-tight">{t}</span>
                        </div>
                        <i className="fa-solid fa-chevron-right text-[10px] text-slate-800 group-hover:text-blue-500 group-hover:translate-x-1 transition-all"></i>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in fade-in duration-500">
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 shadow-xl">
                <div className="flex justify-between items-center mb-10">
                  <h4 className="text-[11px] font-black uppercase text-slate-500 tracking-[0.2em]">生产控制台</h4>
                  <div className="flex items-center gap-3">
                    {errorOccurred && (
                       <button onClick={() => startWorkflow()} className="px-3 py-1 bg-red-500/20 border border-red-500/40 text-red-500 rounded-lg text-[10px] font-black hover:bg-red-500/30 transition-all flex items-center gap-2">
                         <i className="fa-solid fa-rotate-right"></i> 重新尝试
                       </button>
                    )}
                    <span className="text-lg font-mono font-bold text-blue-400">{Math.round(getStepProgress())}%</span>
                  </div>
                </div>
                <div className="h-2 bg-slate-800 rounded-full mb-10 overflow-hidden">
                  <div className={`h-full transition-all duration-700 ${errorOccurred ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${getStepProgress()}%` }}></div>
                </div>
                <div className="space-y-8">
                  {STEPS_CONFIG.map((s, i) => {
                    const stepIndex = STEPS_CONFIG.findIndex(sc => sc.step === currentStep);
                    const isDone = i < stepIndex || currentStep === WorkflowStep.COMPLETED;
                    const isCurrent = s.step === currentStep;
                    const isStepError = errorOccurred && isCurrent;
                    return (
                      <div key={s.step} className={`flex items-start gap-6 transition-all duration-300 ${isCurrent ? 'opacity-100 scale-[1.02]' : isDone ? 'opacity-60' : 'opacity-20'}`}>
                        <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-xs shadow-lg ${isStepError ? 'bg-red-500 text-white' : isDone ? 'bg-green-500 text-white' : isCurrent ? 'bg-blue-600 text-white animate-pulse' : 'bg-slate-800 text-slate-600'}`}>
                          {isStepError ? <i className="fa-solid fa-triangle-exclamation"></i> : isDone ? <i className="fa-solid fa-check"></i> : <i className={`fa-solid ${s.icon}`}></i>}
                        </div>
                        <div className="flex-1 pt-1">
                          <h5 className={`text-[11px] font-black uppercase tracking-widest ${isStepError ? 'text-red-400' : 'text-slate-300'}`}>{s.label}</h5>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] h-[500px] flex flex-col overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-slate-800 bg-slate-950/60 flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">执行过程日志 (CoT)</span>
                </div>
                <div className="flex-1 p-8 font-mono text-[11px] overflow-y-auto space-y-4 custom-scrollbar bg-black/20">
                  {executionLogs.map((log, i) => (
                    <div key={i} className={`flex gap-4 animate-in fade-in slide-in-from-left-2 ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : log.type === 'working' ? 'text-blue-400' : 'text-slate-500'}`}>
                      <span className="opacity-20 flex-shrink-0">[{new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })}]</span>
                      <span className="flex-1 leading-relaxed">
                        {log.type === 'working' && <i className="fa-solid fa-terminal animate-pulse mr-3"></i>}
                        {log.type === 'error' && <i className="fa-solid fa-circle-xmark mr-3"></i>}
                        {log.msg}
                      </span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>

            <div className="lg:col-span-8">
              {currentStep === WorkflowStep.COMPLETED ? (
                <div className="space-y-8 animate-in fade-in duration-1000">
                  <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-12 flex flex-col md:flex-row gap-12 items-center shadow-2xl relative overflow-hidden">
                    <button 
                      onClick={togglePlayback} 
                      className="w-28 h-28 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center text-5xl shadow-2xl shadow-blue-600/40 active:scale-95 transition-all z-10"
                    >
                      <i className={`fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'}`}></i>
                    </button>
                    <div className="flex-1 space-y-6 z-10 text-center md:text-left">
                      <h2 className="text-5xl font-black text-white leading-[1.1] tracking-tight">{content.title}</h2>
                      <div className="flex items-center gap-8">
                        <div className="flex-1 h-2 bg-slate-800/80 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(currentTime / duration) * 100}%` }}></div>
                        </div>
                        <span className="text-sm font-mono font-black text-slate-500">
                          {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')} / {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-[3.5rem] overflow-hidden shadow-2xl">
                    <div className="flex border-b border-slate-800 bg-slate-950/60 px-10">
                      {[
                        { id: 'script', label: '精选对话脚本', icon: 'fa-feather' },
                        { id: 'process', label: '素材总结', icon: 'fa-database' },
                        { id: 'sources', label: '引用数据源', icon: 'fa-link' }
                      ].map(t => (
                        <button 
                          key={t.id} 
                          onClick={() => setActiveTab(t.id as any)} 
                          className={`flex items-center gap-3 px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${activeTab === t.id ? 'border-blue-500 text-blue-500 bg-blue-500/5' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                        >
                          <i className={`fa-solid ${t.icon} text-xs`}></i>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <div className="p-16 min-h-[600px] max-h-[900px] overflow-y-auto custom-scrollbar">
                      {activeTab === 'script' && (
                        <div className="space-y-16">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {content.highlights?.map((h, i) => (
                              <div key={i} className="bg-slate-950 border border-slate-800 p-8 rounded-[2rem]">
                                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-4 block">{h.label}</span>
                                <p className="text-sm text-slate-400 font-medium leading-relaxed">{h.description}</p>
                              </div>
                            ))}
                          </div>

                          <div className="space-y-12 pt-16 border-t border-slate-800">
                            {content.finalScript?.split('\n').map((line, i) => {
                              const [s, ...txt] = line.split(/[：:]/);
                              if (!s || txt.length === 0) return null;
                              const isGuest = s.includes('嘉宾') || s.includes('张老师');
                              return (
                                <div key={i} className="group flex flex-col gap-4">
                                  <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${isGuest ? 'text-indigo-400' : 'text-blue-400'}`}>
                                    {s}
                                  </span>
                                  <p className="text-2xl text-slate-200 leading-[1.8] font-medium">
                                    {txt.join('：').trim()}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {activeTab === 'process' && (
                        <div className="bg-black/40 p-12 rounded-[3rem] border border-slate-800/60 text-blue-400 font-mono text-xs overflow-x-auto">
                          <pre>{content.materials ? JSON.stringify(JSON.parse(content.materials), null, 2) : 'No data.'}</pre>
                        </div>
                      )}
                      {activeTab === 'sources' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {content.groundingLinks?.map((l, i) => (
                            <a key={i} href={l.uri} target="_blank" rel="noreferrer" className="flex items-center gap-8 p-8 bg-slate-950/50 border border-slate-800 rounded-[2.5rem] hover:border-blue-500/50 transition-all group">
                              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl ${l.type === 'video' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                <i className={`fa-solid ${l.type === 'video' ? 'fa-play-circle' : l.type === 'news' ? 'fa-newspaper' : 'fa-link'}`}></i>
                              </div>
                              <div className="flex-1 overflow-hidden">
                                <h4 className="text-base font-black text-slate-200 truncate group-hover:text-blue-400">{l.title}</h4>
                                <p className="text-[10px] text-slate-600 truncate mt-2 font-mono">{l.uri}</p>
                                <span className="inline-block mt-3 px-2 py-0.5 rounded text-[8px] font-black uppercase bg-slate-800 text-slate-400 tracking-widest">
                                  {l.type === 'video' ? '视频源' : l.type === 'news' ? '新闻报道' : '网页资料'}
                                </span>
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-900/40 border border-slate-800/60 rounded-[3.5rem] p-24 flex flex-col items-center justify-center min-h-[700px] text-center shadow-2xl backdrop-blur-sm relative">
                  {errorOccurred && (
                    <div className="absolute inset-0 bg-[#020617]/80 backdrop-blur-md rounded-[3.5rem] flex flex-col items-center justify-center z-20 p-12">
                      <div className="w-24 h-24 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center text-4xl mb-8 border border-red-500/40">
                        <i className="fa-solid fa-triangle-exclamation"></i>
                      </div>
                      <h4 className="text-3xl font-black text-white mb-4">生产链路中断</h4>
                      <p className="text-slate-400 max-w-md mb-12">由于网络波动或 API 限制，当前的生产流程已中断。别担心，你的素材已保存，你可以尝试重新运行。</p>
                      <button onClick={() => startWorkflow()} className="bg-blue-600 hover:bg-blue-500 px-12 py-4 rounded-2xl font-black text-white shadow-xl shadow-blue-600/30 active:scale-95 transition-all flex items-center gap-4">
                        <i className="fa-solid fa-rotate-right"></i> 重新尝试生产
                      </button>
                    </div>
                  )}
                  
                  <div className="relative w-40 h-40 mb-16">
                    <div className="absolute inset-0 border-[6px] border-blue-500/10 rounded-full"></div>
                    <div className="absolute inset-0 border-[6px] border-t-blue-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <i className={`fa-solid ${STEPS_CONFIG.find(s => s.step === currentStep)?.icon} text-5xl text-blue-500 animate-pulse`}></i>
                    </div>
                  </div>
                  <h3 className="text-5xl font-black text-white mb-6 tracking-tighter">{STEPS_CONFIG.find(s => s.step === currentStep)?.label}</h3>
                  <p className="text-slate-500 max-w-sm mb-12 text-lg">{STEPS_CONFIG.find(s => s.step === currentStep)?.description}</p>
                  
                  <div className="w-full max-w-lg bg-slate-950/80 rounded-[2rem] p-10 text-left font-mono text-[11px] text-blue-400 animate-pulse border border-slate-800 shadow-inner">
                    <div className="flex items-center gap-3 mb-6">
                      <i className="fa-solid fa-microchip text-blue-500"></i>
                      <span className="text-slate-500 uppercase text-[9px] font-black tracking-widest">正在进行的操作细节</span>
                    </div>
                    <div className="space-y-3 opacity-80">
                      {currentStep === WorkflowStep.RESEARCH && "> 正在联网穿透搜索，深度解析视频摘要与机构观点..."}
                      {currentStep === WorkflowStep.SYNTHESIS && `> 正在合成高清音频 (${synthesisProgress.current}/${synthesisProgress.total})...`}
                      {currentStep === WorkflowStep.DRAFTING && `> 正在撰写 2800 字口语化深度剧本...`}
                      {(![WorkflowStep.RESEARCH, WorkflowStep.SYNTHESIS, WorkflowStep.DRAFTING].includes(currentStep)) && "> 正在执行 AI 生产引擎..."}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .animate-in { animation: fadeIn 0.8s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        .animate-marquee { display: flex; animation: marquee 40s linear infinite; }
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-marquee:hover { animation-play-state: paused; }
      `}</style>
    </div>
  );
};

export default App;
