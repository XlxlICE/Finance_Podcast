
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
            <h2 className="text-4xl font-extrabold mb-4">智能结构化财经播客生成</h2>
            <p className="text-gray-400">输入财经热词，自动完成：素材搜集 &rarr; 逻辑建模 &rarr; 专业对话合成</p>
          </div>
          <div className="bg-slate-800/40 p-10 rounded-[2.5rem] border border-slate-700 backdrop-blur-md shadow-2xl">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-3 ml-1">输入核心热词</label>
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
                    生成
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {['2025黄金逻辑', '新能源车利润池', '美债收益率大变局'].map(tag => (
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
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6">流水线状态</h4>
              <div className="space-y-3">
                {STEPS_CONFIG.map((stepConfig, index) => {
                  const isCurrent = currentStep === stepConfig.step;
                  const isPast = STEPS_CONFIG.findIndex(s => s.step === currentStep) > index || currentStep === WorkflowStep.COMPLETED;
                  return (
                    <div key={stepConfig.step} className={`relative pl-8 py-2 transition-opacity ${isCurrent ? 'opacity-100 scale-105' : 'opacity-40'}`}>
                      <div className={`absolute left-0 top-2 w-5 h-5 rounded-full border-2 flex items-center justify-center ${isPast ? 'bg-green-500 border-green-500 text-white' : isCurrent ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-600'}`}>
                        {isPast ? <i className="fas fa-check text-[8px]"></i> : <i className={`fas ${stepConfig.icon} text-[8px]`}></i>}
                      </div>
                      <h3 className={`font-bold text-xs ${isCurrent ? 'text-blue-400' : 'text-gray-300'}`}>{stepConfig.label}</h3>
                    </div>
                  );
                })}
              </div>
              {currentStep === WorkflowStep.COMPLETED && (
                <button onClick={reset} className="w-full mt-10 py-3 bg-slate-800 rounded-xl text-xs font-bold text-gray-300 border border-slate-700"><i className="fas fa-rotate-left mr-2"></i>重新开始</button>
              )}
            </div>
          </div>

          <div className="lg:col-span-9 space-y-8 w-full">
            {currentStep !== WorkflowStep.COMPLETED ? (
              <div className="bg-slate-800/30 p-16 rounded-[3rem] border border-slate-700 flex flex-col items-center justify-center min-h-[400px] text-center">
                <div className="w-20 h-20 border-4 border-blue-500/10 border-t-blue-500 rounded-full animate-spin mb-6"></div>
                <h2 className="text-xl font-bold mb-2">正在处理：{STEPS_CONFIG.find(s => s.step === currentStep)?.label}</h2>
                <p className="text-gray-500 text-sm">AI Agent 正在构建财经逻辑骨架...</p>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700 w-full">
                <div className="bg-slate-800/40 p-8 md:p-12 rounded-[2.5rem] border border-slate-700 shadow-2xl w-full">
                  <div className="flex flex-col gap-8 w-full">
                    <div className="text-center w-full">
                      <h2 className="text-3xl md:text-4xl font-black text-white mb-2 leading-tight break-words">{content.title}</h2>
                      <p className="text-blue-500 text-sm font-bold uppercase tracking-[0.3em]">FinancePod AI Engine v1.0</p>
                    </div>
                    <div className="flex flex-col gap-4 w-full">
                      <div className="space-y-2 w-full">
                        <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden relative">
                          <div 
                            className="h-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${(currentTime / duration) * 100}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                          <span>{formatTime(currentTime)}</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-10 py-2">
                        <button 
                          onClick={togglePlayback}
                          className="w-20 h-20 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-xl shadow-blue-600/20 transition-all hover:scale-105 active:scale-95"
                        >
                          <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'} text-3xl`}></i>
                        </button>
                        <button 
                          onClick={exportAudio}
                          className="w-12 h-12 bg-slate-700 hover:bg-slate-600 rounded-2xl flex items-center justify-center text-gray-300 transition-colors"
                        >
                          <i className="fas fa-download text-lg"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-800/30 rounded-[2.5rem] border border-slate-700 overflow-hidden w-full">
                  <div className="flex border-b border-slate-700/50 bg-slate-900/30 overflow-x-auto scrollbar-hide">
                    <button 
                      onClick={() => setActiveTab('script')}
                      className={`px-8 py-5 text-xs font-bold transition-all border-b-2 whitespace-nowrap ${activeTab === 'script' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500'}`}
                    >
                      对话正文
                    </button>
                    <button 
                      onClick={() => setActiveTab('process')}
                      className={`px-8 py-5 text-xs font-bold transition-all border-b-2 whitespace-nowrap ${activeTab === 'process' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500'}`}
                    >
                      大纲/爆点
                    </button>
                    <button 
                      onClick={() => setActiveTab('sources')}
                      className={`px-8 py-5 text-xs font-bold transition-all border-b-2 whitespace-nowrap ${activeTab === 'sources' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500'}`}
                    >
                      数据引用
                    </button>
                  </div>
                  <div className="p-6 md:p-10 w-full">
                    {activeTab === 'script' && (
                      <div className="animate-in fade-in duration-500 w-full">
                        <div className="space-y-8 w-full">
                          {content.finalScript?.split('\n').filter(l => l.includes('：') || l.includes(':')).map((line, i) => {
                            const separator = line.includes('：') ? '：' : ':';
                            const parts = line.split(separator);
                            const speaker = parts[0];
                            const text = parts.slice(1).join(separator);
                            return (
                              <div key={i} className="flex flex-col sm:flex-row gap-2 sm:gap-6 w-full">
                                <span className="text-blue-400 font-bold text-sm w-full sm:w-24 flex-shrink-0 uppercase tracking-wider">{speaker}</span>
                                <p className="text-gray-300 text-lg leading-relaxed flex-1 break-words">{text}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {activeTab === 'process' && (
                      <div className="space-y-8 animate-in fade-in duration-500 w-full">
                        <div className="p-6 bg-slate-900/50 rounded-2xl border border-slate-700 w-full">
                          <h5 className="text-[10px] font-bold text-gray-500 uppercase mb-4 tracking-widest">逻辑建模大纲</h5>
                          <div className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed font-sans">{content.outline}</div>
                        </div>
                        <div className="p-6 bg-slate-900/50 rounded-2xl border border-slate-700 w-full">
                          <h5 className="text-[10px] font-bold text-gray-500 uppercase mb-4 tracking-widest">核心设计钩子</h5>
                          <ul className="space-y-4">
                            {content.hooks?.map((h, i) => <li key={i} className="text-sm text-blue-400 italic bg-blue-500/5 p-4 rounded-xl border border-blue-500/10">" {h} "</li>)}
                          </ul>
                        </div>
                      </div>
                    )}
                    {activeTab === 'sources' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-500 w-full">
                        {content.groundingLinks && content.groundingLinks.length > 0 ? content.groundingLinks.map((link, i) => (
                          <a key={i} href={link.uri} target="_blank" rel="noreferrer" className="flex items-center gap-4 p-5 bg-slate-900/50 rounded-2xl border border-slate-700 hover:border-blue-500/30 transition-all group overflow-hidden">
                            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-gray-500 group-hover:text-blue-500">
                              <i className="fas fa-link"></i>
                            </div>
                            <div className="flex-1 overflow-hidden">
                              <h6 className="text-xs font-bold text-gray-300 truncate group-hover:text-blue-400 transition-colors">{link.title}</h6>
                              <p className="text-[9px] text-gray-500 truncate mt-1">{link.uri}</p>
                            </div>
                          </a>
                        )) : (
                          <div className="col-span-1 md:col-span-2 py-12 flex flex-col items-center justify-center text-gray-600 gap-3 opacity-60">
                            <i className="fas fa-magnifying-glass text-3xl"></i>
                            <p className="text-sm">未发现直接引用的外部数据源</p>
                          </div>
                        )}
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
        <div className="fixed bottom-8 right-8 bg-slate-900 border border-red-500/50 p-6 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-right duration-300 z-[9999]">
          <i className="fas fa-circle-exclamation text-red-500 text-xl"></i>
          <p className="text-sm font-medium">{error}</p>
          <button onClick={() => setError(null)} className="opacity-50 hover:opacity-100"><i className="fas fa-x"></i></button>
        </div>
      )}
    </div>
  );
};

export default App;
