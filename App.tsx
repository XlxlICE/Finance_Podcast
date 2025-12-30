
import React, { useState, useEffect, useRef } from 'react';
import { WorkflowStep, PodcastContent } from './types';
import { STEPS_CONFIG } from './constants';
import * as gemini from './services/geminiService';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(WorkflowStep.IDLE);
  const [keyword, setKeyword] = useState('');
  const [content, setContent] = useState<PodcastContent>({ keyword: '' });
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'script' | 'process' | 'sources'>('script');
  
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const startTimeRef = useRef<number>(0);
  const offsetRef = useRef<number>(0);
  const rafIdRef = useRef<number>(0);

  const updateProgress = () => {
    if (isPlaying && audioContextRef.current) {
      const current = offsetRef.current + (audioContextRef.current.currentTime - startTimeRef.current);
      setCurrentTime(current);
      if (current >= duration) {
        stopPlayback();
      } else {
        rafIdRef.current = requestAnimationFrame(updateProgress);
      }
    }
  };

  const startWorkflow = async () => {
    if (!keyword.trim()) return;
    setError(null);
    setCurrentStep(WorkflowStep.RESEARCH);
    setContent({ keyword });
    setCurrentTime(0);
    offsetRef.current = 0;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      const researchData = await gemini.collectMaterials(keyword);
      setContent(prev => ({ ...prev, materials: researchData.text, groundingLinks: researchData.links }));
      
      setCurrentStep(WorkflowStep.INSIGHTS);
      const insights = await gemini.designInsights(researchData.text);
      const title = await gemini.generateEpisodeTitle(keyword, insights);
      setContent(prev => ({ ...prev, hooks: insights, title }));

      setCurrentStep(WorkflowStep.OUTLINE);
      const outline = await gemini.generateOutline(keyword, insights);
      setContent(prev => ({ ...prev, outline }));

      setCurrentStep(WorkflowStep.DRAFTING);
      const draft = await gemini.generateScript(outline);
      setContent(prev => ({ ...prev, draftScript: draft }));

      setCurrentStep(WorkflowStep.REVIEW);
      const refinedScript = await gemini.reviewAndRefine(draft);
      setContent(prev => ({ ...prev, finalScript: refinedScript }));

      setCurrentStep(WorkflowStep.SYNTHESIS);
      const audioBuffer = await gemini.synthesizePodcast(refinedScript, audioContextRef.current);
      
      setDuration(audioBuffer.duration);
      setContent(prev => ({ ...prev, audioBuffer }));
      setCurrentStep(WorkflowStep.COMPLETED);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "生成失败，请刷新重试。");
      setCurrentStep(WorkflowStep.IDLE);
    }
  };

  const stopPlayback = () => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch(e) {}
    }
    cancelAnimationFrame(rafIdRef.current);
    setIsPlaying(false);
  };

  const togglePlayback = async () => {
    if (!content.audioBuffer || !audioContextRef.current) return;
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();

    if (isPlaying) {
      offsetRef.current += (audioContextRef.current.currentTime - startTimeRef.current);
      stopPlayback();
    } else {
      if (offsetRef.current >= duration) offsetRef.current = 0;
      const source = audioContextRef.current.createBufferSource();
      source.buffer = content.audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => {
        if (isPlaying) setIsPlaying(false);
      };
      startTimeRef.current = audioContextRef.current.currentTime;
      source.start(0, offsetRef.current);
      audioSourceRef.current = source;
      setIsPlaying(true);
      rafIdRef.current = requestAnimationFrame(updateProgress);
    }
  };

  const formatTime = (time: number) => {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const exportAudio = () => {
    if (!content.audioBuffer) return;
    const blob = gemini.bufferToWav(content.audioBuffer);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${content.title || 'podcast'}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setCurrentStep(WorkflowStep.IDLE);
    setKeyword('');
    setContent({ keyword: '' });
    setError(null);
    stopPlayback();
    offsetRef.current = 0;
    setCurrentTime(0);
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 max-w-7xl mx-auto">
      <header className="w-full flex justify-between items-center mb-12 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <i className="fas fa-chart-line text-white"></i>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">FinancePod <span className="text-blue-500">AI</span></h1>
        </div>
      </header>

      {currentStep === WorkflowStep.IDLE ? (
        <div className="w-full max-w-3xl animate-in fade-in zoom-in duration-500">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-extrabold mb-4 text-white leading-tight">全自动化财经播客工厂</h2>
            <p className="text-gray-400">输入财经热词，AI 实时搜集视频/音频/文本素材，并生成专业对谈。</p>
          </div>
          <div className="bg-slate-800/40 p-10 rounded-[2.5rem] border border-slate-700 backdrop-blur-md shadow-2xl">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-3 ml-1">输入核心热词 (如：英伟达财报、美联储降息)</label>
                <div className="relative group">
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="例如：日本央行加息、NVDA财报深度分析..."
                    className="w-full bg-slate-900/80 border border-slate-600 rounded-2xl px-6 py-5 text-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all group-hover:border-slate-500"
                  />
                  <button
                    onClick={startWorkflow}
                    className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 rounded-xl transition-all shadow-lg active:scale-95"
                  >
                    生成播客
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {['2025黄金投资逻辑', '新能源车下半场', '美债收益率大转折'].map(tag => (
                  <button key={tag} onClick={() => setKeyword(tag)} className="text-xs bg-slate-700/50 px-3 py-1.5 rounded-lg border border-slate-600 hover:border-blue-500/50">{tag}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-3 space-y-4">
            <div className="sticky top-8">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6 px-1">流水线状态</h4>
              <div className="space-y-3">
                {STEPS_CONFIG.map((stepConfig, index) => {
                  const isCurrent = currentStep === stepConfig.step;
                  const isPast = STEPS_CONFIG.findIndex(s => s.step === currentStep) > index || currentStep === WorkflowStep.COMPLETED;
                  return (
                    <div key={stepConfig.step} className={`relative pl-8 py-2 transition-all duration-500 ${isCurrent ? 'opacity-100 translate-x-1' : 'opacity-40'}`}>
                      <div className={`absolute left-0 top-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isPast ? 'bg-green-500 border-green-500 text-white' : isCurrent ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-600'}`}>
                        {isPast ? <i className="fas fa-check text-[8px]"></i> : <i className={`fas ${stepConfig.icon} text-[8px]`}></i>}
                      </div>
                      <h3 className={`font-bold text-xs ${isCurrent ? 'text-blue-400' : 'text-gray-300'}`}>{stepConfig.label}</h3>
                    </div>
                  );
                })}
              </div>
              {currentStep === WorkflowStep.COMPLETED && (
                <button onClick={reset} className="w-full mt-10 py-3 bg-slate-800 rounded-xl text-xs font-bold text-gray-300 border border-slate-700 hover:bg-slate-700 transition-colors"><i className="fas fa-rotate-left mr-2"></i>生成下一个</button>
              )}
            </div>
          </div>

          <div className="lg:col-span-9 space-y-8 w-full max-w-full">
            {currentStep !== WorkflowStep.COMPLETED ? (
              <div className="bg-slate-800/30 p-16 rounded-[3rem] border border-slate-700 flex flex-col items-center justify-center min-h-[450px] text-center w-full">
                <div className="w-24 h-24 border-4 border-blue-500/10 border-t-blue-500 rounded-full animate-spin mb-8 shadow-[0_0_20px_rgba(59,130,246,0.2)]"></div>
                <h2 className="text-2xl font-bold mb-3">{STEPS_CONFIG.find(s => s.step === currentStep)?.label}</h2>
                <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed">
                  {currentStep === WorkflowStep.RESEARCH ? '正在利用 Google Search 实时挖掘全球视频、播客与研报数据...' : 'AI 正在精炼核心洞察并构建叙事逻辑...'}
                </p>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700 w-full overflow-hidden">
                {/* Simplified Professional Player UI */}
                <div className="bg-slate-800/40 p-8 md:p-14 rounded-[3rem] border border-slate-700 shadow-2xl w-full">
                  <div className="flex flex-col gap-10 w-full">
                    <div className="text-center w-full">
                      <h2 className="text-3xl md:text-5xl font-black text-white mb-3 leading-tight break-words px-2">{content.title}</h2>
                      <div className="flex items-center justify-center gap-2">
                         <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                         <p className="text-blue-500 text-xs font-bold uppercase tracking-[0.4em]">FinancePod AI Engine v1.1 Active</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-6 w-full px-2">
                      <div className="space-y-3 w-full">
                        <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden relative shadow-inner">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                            style={{ width: `${(currentTime / duration) * 100}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-[11px] font-mono text-gray-500 uppercase tracking-widest px-1">
                          <span>{formatTime(currentTime)}</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-12 py-2">
                        <button 
                          onClick={togglePlayback}
                          className="w-24 h-24 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-2xl shadow-blue-600/30 transition-all hover:scale-110 active:scale-95 group"
                        >
                          <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'} text-4xl group-hover:scale-110 transition-transform`}></i>
                        </button>
                        <button 
                          onClick={exportAudio}
                          className="w-14 h-14 bg-slate-700 hover:bg-slate-600 rounded-2xl flex items-center justify-center text-gray-300 transition-all shadow-lg hover:shadow-blue-500/10"
                        >
                          <i className="fas fa-download text-xl"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tabs for detailed content */}
                <div className="bg-slate-800/30 rounded-[3rem] border border-slate-700 overflow-hidden w-full shadow-lg">
                  <div className="flex border-b border-slate-700/50 bg-slate-900/30 overflow-x-auto scrollbar-hide">
                    <button 
                      onClick={() => setActiveTab('script')}
                      className={`px-10 py-6 text-xs font-bold transition-all border-b-2 whitespace-nowrap ${activeTab === 'script' ? 'border-blue-500 text-blue-500 bg-blue-500/5' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                      对话正文
                    </button>
                    <button 
                      onClick={() => setActiveTab('process')}
                      className={`px-10 py-6 text-xs font-bold transition-all border-b-2 whitespace-nowrap ${activeTab === 'process' ? 'border-blue-500 text-blue-500 bg-blue-500/5' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                      大纲/爆点
                    </button>
                    <button 
                      onClick={() => setActiveTab('sources')}
                      className={`px-10 py-6 text-xs font-bold transition-all border-b-2 whitespace-nowrap ${activeTab === 'sources' ? 'border-blue-500 text-blue-500 bg-blue-500/5' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                      数据引用
                    </button>
                  </div>

                  <div className="p-8 md:p-12 w-full max-w-full">
                    {activeTab === 'script' && (
                      <div className="animate-in fade-in duration-500 w-full">
                        <div className="space-y-10 w-full">
                          {content.finalScript?.split('\n').filter(l => l.includes('：') || l.includes(':')).map((line, i) => {
                            const separator = line.includes('：') ? '：' : ':';
                            const parts = line.split(separator);
                            const speaker = parts[0];
                            const text = parts.slice(1).join(separator);
                            const isZhang = speaker.includes('张');
                            return (
                              <div key={i} className={`flex flex-col gap-3 w-full max-w-full ${isZhang ? 'items-start' : 'items-start'}`}>
                                <span className={`font-black text-xs uppercase tracking-widest px-3 py-1 rounded-md ${isZhang ? 'bg-indigo-500/10 text-indigo-400' : 'bg-blue-500/10 text-blue-400'}`}>{speaker}</span>
                                <p className="text-gray-200 text-xl leading-relaxed max-w-full break-words font-medium">{text}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {activeTab === 'process' && (
                      <div className="space-y-10 animate-in fade-in duration-500 w-full">
                        <div className="p-8 bg-slate-900/50 rounded-3xl border border-slate-700 w-full shadow-inner">
                          <h5 className="text-[10px] font-bold text-gray-500 uppercase mb-6 tracking-widest border-b border-slate-800 pb-3 flex items-center gap-3">
                            <i className="fas fa-sitemap text-blue-500"></i> 逻辑建模大纲
                          </h5>
                          <div className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed font-sans">{content.outline}</div>
                        </div>
                        <div className="p-8 bg-slate-900/50 rounded-3xl border border-slate-700 w-full shadow-inner">
                          <h5 className="text-[10px] font-bold text-gray-500 uppercase mb-6 tracking-widest border-b border-slate-800 pb-3 flex items-center gap-3">
                            <i className="fas fa-lightbulb text-yellow-500"></i> 核心设计钩子 (Hooks)
                          </h5>
                          <ul className="space-y-5">
                            {content.hooks?.map((h, i) => (
                              <li key={i} className="text-sm text-blue-400 italic bg-blue-500/5 p-6 rounded-2xl border border-blue-500/10 shadow-sm relative">
                                <i className="fas fa-quote-left absolute top-4 left-4 text-2xl opacity-10"></i>
                                <span className="relative z-10 block px-4">{h}</span>
                                <i className="fas fa-quote-right absolute bottom-4 right-4 text-2xl opacity-10"></i>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {activeTab === 'sources' && (
                      <div className="animate-in fade-in duration-500 w-full">
                         <div className="flex items-center justify-between mb-8">
                            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">本次播客生成的深度数据支撑点：</p>
                            <span className="text-[10px] bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full border border-blue-500/20 font-bold">已校验 {content.groundingLinks?.length || 0} 个来源</span>
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
                          {content.groundingLinks && content.groundingLinks.length > 0 ? content.groundingLinks.map((link, i) => (
                            <a 
                              key={i} 
                              href={link.uri} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="flex items-center gap-5 p-6 bg-slate-900/50 rounded-[2.5rem] border border-slate-700 hover:border-blue-500/30 transition-all group overflow-hidden shadow-sm hover:shadow-blue-500/5"
                            >
                              <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center text-gray-500 group-hover:text-blue-500 group-hover:bg-blue-500/10 transition-all shadow-inner">
                                <i className={`fas ${link.type === 'video' ? 'fa-play-circle' : link.type === 'news' ? 'fa-podcast' : 'fa-link'} text-2xl`}></i>
                              </div>
                              <div className="flex-1 overflow-hidden">
                                <h6 className="text-sm font-bold text-gray-200 truncate group-hover:text-blue-400 transition-colors">{link.title}</h6>
                                <div className="flex items-center gap-2 mt-2">
                                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${link.type === 'video' ? 'bg-red-500/10 text-red-400' : link.type === 'news' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                                    {link.type === 'video' ? '视频' : link.type === 'news' ? '媒体/音频' : '文本'}
                                  </span>
                                  <p className="text-[10px] text-gray-500 truncate opacity-60 font-mono">{link.uri}</p>
                                </div>
                              </div>
                            </a>
                          )) : (
                            <div className="col-span-1 md:col-span-2 py-24 flex flex-col items-center justify-center text-gray-600 gap-5 opacity-40 border-2 border-dashed border-slate-800 rounded-[4rem]">
                              <i className="fas fa-magnifying-glass text-5xl"></i>
                              <p className="text-sm font-bold tracking-widest uppercase">正在穿透互联网进行深度检索...</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-8 right-8 bg-slate-950 border border-red-500/50 p-6 rounded-3xl shadow-2xl flex items-center gap-5 animate-in slide-in-from-right duration-300 z-[9999] backdrop-blur-xl">
          <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
            <i className="fas fa-circle-exclamation text-xl"></i>
          </div>
          <p className="text-sm font-semibold text-gray-200">{error}</p>
          <button onClick={() => setError(null)} className="opacity-40 hover:opacity-100 p-2 text-white"><i className="fas fa-x"></i></button>
        </div>
      )}
      
      <footer className="mt-24 py-10 w-full border-t border-slate-800/50 flex flex-col items-center text-center">
        <div className="flex gap-4 mb-5 text-gray-500 text-sm">
           <i className="fas fa-shield-halved"></i>
           <p className="uppercase tracking-[0.3em] text-[10px] font-black">金融数据真实性校验引擎 v1.1.0-STABLE</p>
        </div>
        <p className="text-[10px] text-gray-600 max-w-xl leading-relaxed">
          © 2025 FinancePod AI. 基于 Google Gemini 3 系列模型构建。本系统生成的所有音频、文本及洞察内容仅供演示参考，不构成任何形式的投资建议或财务咨询。投资有风险，决策需谨慎。
        </p>
      </footer>
    </div>
  );
};

export default App;
