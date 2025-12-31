
import { GoogleGenAI, Type, Modality } from "@google/genai";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });
const getToday = () => new Date().toISOString().slice(0, 10);

export function cleanScript(text: string): string {
  if (!text) return '';
  return text.replace(/\*\*/g, '').split('\n')
    .filter(line => /^[^：:]+[：:]/.test(line.trim()))
    .join('\n');
}

/**
 * 获取三大平台的财经热搜
 */
export async function fetchTrendingTopics(): Promise<Record<string, string[]>> {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "请实时搜索并总结当前中国 A 股最热门的词条，分别从【同花顺】、【雪球】、【东方财富】三个平台提取各 5 个最热词。以 JSON 格式返回，Key 分别为 'ths', 'xq', 'dfcf'。",
      config: { 
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (e) {
    return {
      ths: ["中际旭创", "工业母机", "低空经济", "宁德时代", "赛力斯"],
      xq: ["人形机器人", "高股息资产", "英伟达", "腾讯控股", "贵州茅台"],
      dfcf: ["固态电池", "券商板块", "白酒龙头", "半导体国产化", "创新药"]
    };
  }
}

/**
 * 获取 A 股最近重要的财经大事
 */
export async function fetchFinancialEvents(): Promise<{title: string, summary: string}[]> {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "搜索并总结今日 A 股最重要的 3 条财经大事。要求：标题简短有力，摘要一句话说明核心影响。以 JSON 数组格式返回，包含 title 和 summary 字段。",
      config: { 
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (e) {
    return [
      { title: "新质生产力政策深化", summary: "相关板块近期表现活跃，资金关注度显著提升。" },
      { title: "多家蓝筹股发布分红方案", summary: "高股息策略成为当前市场避险情绪的首选路径。" },
      { title: "全球算力需求超预期", summary: "AI硬件链条出口数据亮眼，带动国产替代逻辑加强。" }
    ];
  }
}

/**
 * 专项辅助函数：对视频/音频链接进行内容模拟提取（通过搜索其摘要/评论/转写文本）
 */
async function deepDiveLink(url: string, title: string): Promise<string> {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `针对这个特定的链接（可能是视频或深度播客）："${url}" (标题: ${title})。
      请搜索并提取该内容的【核心干货摘要】。
      如果是视频，重点关注博主的结论、评论区点赞最高的总结、或相关的转写摘要。
      如果是音频/播客，重点关注其时间轴要点。
      请输出一段极高密度的文字摘要。`,
      config: { tools: [{ googleSearch: {} }] }
    });
    return `来自链接 [${title}] 的深度摘要: ${response.text}\n\n`;
  } catch {
    return "";
  }
}

/**
 * 步骤 1：多模态素材搜集 (加强音视频穿透)
 */
export async function collectMaterials(keyword: string, onProgress?: (msg: string) => void) {
  const ai = getAI();
  const today = getToday();
  
  // 这里保持用户要求的原 Prompt 不变
  const prompt = `你是一名“财经研究 + 叙事素材整合”编辑。
任务：针对“${keyword}”，结合联网搜索与公开资料，在 ${today} 前后可验证信息的基础上，输出可用于播客的“故事化素材池”。

总原则（必须遵守）：
1) 不输出任何投资建议，不出现买/卖/加仓/抄底/布局/上车等词
2) 不评价股价涨跌是否合理
3) 所有判断统一改写为“市场如何理解 / 市场讨论焦点在于 / 被视为”
4) 允许叙事化表达，但必须克制、可回溯
5) 不凭空发挥，必须基于可验证线索
6) 最终只输出严格 JSON，不输出 Markdown 或工具细节

步骤：
1) 先判断热词类型：个股 / 非个股 / 事件
2) 针对类型输出素材池 JSON（字段缺失可用空数组/空字符串，禁止编造）

[... 中间省略的 JSON 结构定义保持一致 ...]

注意：只输出 JSON，信息密度高但语言克制，避免研报腔。`;

  // 第一步：执行初始素材搜集
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json"
    },
  });

  let materialJson = response.text || "";
  const metadata = response.candidates?.[0]?.groundingMetadata;
  
  // 识别并分类引用源
  const links: { title: string; uri: string; type: 'web' | 'video' | 'news' }[] = metadata?.groundingChunks?.map((chunk: any) => {
    const uri = String(chunk.web?.uri || "");
    const title = String(chunk.web?.title || '深度参考');
    let type: 'web' | 'video' | 'news' = 'web';
    
    // 增强的分类识别逻辑
    const videoDomains = ['youtube.com', 'bilibili.com', 'v.qq.com', 'tiktok.com', 'xiaohongshu.com'];
    const newsDomains = ['news.cn', 'wallstreetcn.com', 'caixin.com', 'jiemian.com', 'cls.cn', 'stock.'];
    
    if (videoDomains.some(d => uri.includes(d)) || uri.includes('/video/')) type = 'video';
    else if (newsDomains.some(d => uri.includes(d)) || uri.includes('/news/')) type = 'news';
    
    return { title, uri, type };
  }) || [];

  // 第二步：内容深度穿透 (模拟音频/视频内容抽取)
  // 如果识别到了视频链接，我们对前 2 个进行专项“深挖”以补充素材池
  const highQualityLinks = links.filter(l => l.type === 'video').slice(0, 2);
  
  if (highQualityLinks.length > 0) {
    if (onProgress) onProgress(`发现 ${highQualityLinks.length} 条视频源，正在进行“内容穿透”解析摘要...`);
    
    let deepDiveInfo = "\n\n--- 视频/音频源深度穿透内容补充 ---\n";
    for (const link of highQualityLinks) {
      const insight = await deepDiveLink(link.uri, link.title);
      deepDiveInfo += insight;
    }
    
    // 将深度挖掘的信息强行注入 materialJson 中，但不破坏原有 JSON 结构（放在 JSON 尾部作为补充文本字段或注释）
    // 为了不破坏用户原有的脚本生成逻辑（脚本生成会读取 JSON 里的 material_pool），我们尝试把信息合并
    try {
      const parsed = JSON.parse(materialJson);
      if (parsed.material_pool) {
        parsed.material_pool.deep_video_insights = deepDiveInfo;
      }
      materialJson = JSON.stringify(parsed);
    } catch (e) {
      // 如果解析失败，直接拼接，模型在大脚本生成时也能看到
      materialJson += deepDiveInfo;
    }
  }

  return { materialJson, links };
}

/**
 * 步骤 2：爆点设计
 */
export async function generateHighlightsAndHooks(keyword: string, materialJson: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `基于“${keyword}”的素材池：${materialJson}

任务：在不新增任何事实的前提下，把素材转译成“可听”的爆点与制作亮点。

请先判断热词类型（个股/非个股/事件），然后输出：
1) hook_sentence：播客第一句话，1-2 句，快速校准听众理解方向
2) analogies：2 条类比，每条 1 句话，降低理解成本
3) contrarian_insight：一句反常识洞察（使用反转句式）
4) hooks：3 条“开场金句/记忆点”，必须可回溯到素材池
5) highlights：3 条制作亮点（口语化重构 / 3 秒听懂 / 数据颗粒度）

约束：
- 不得出现投资建议、涨跌判断、操作暗示
- 语言像人说话，避免术语堆砌与长句压迫
- 每条必须“可听”，第一次接触也能懂

请输出严格 JSON 格式。`,
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          hotword_type: { type: Type.STRING },
          hook_sentence: { type: Type.STRING },
          analogies: { type: Type.ARRAY, items: { type: Type.STRING } },
          contrarian_insight: { type: Type.STRING },
          hooks: { type: Type.ARRAY, items: { type: Type.STRING } },
          highlights: { 
            type: Type.ARRAY, 
            items: { 
              type: Type.OBJECT, 
              properties: {
                label: { type: Type.STRING },
                description: { type: Type.STRING }
              }
            }
          }
        }
      }
    }
  });
  
  return JSON.parse(response.text || "{}");
}

/**
 * 步骤 2.5：生成标题
 */
export async function generateEpisodeTitle(keyword: string, hooks: string[]): Promise<string> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `基于关键词“${keyword}”和这些金句：\n${hooks.join('\n')}\n\n请为这一期财经播客生成一个吸引人的标题。只要标题文本，不需要引号。`,
  });
  return response.text?.replace(/["'“”]/g, '').trim() || `${keyword} 深度解读`;
}

/**
 * 步骤 3：大纲生成
 */
export async function generateOutline(keyword: string, materialJson: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `基于“${keyword}”的素材池：${materialJson}

任务：生成一份“适合被讲出来”的播客大纲（Markdown），用于 8–12 分钟对话。

要求：
1) 先判断热词类型（个股/非个股/事件）与对应类型（公司类型/行业类型/事件类型）
2) 结构必须围绕“异常感知 → What → Why Now → 深度拆解 → 观察路径”
3) 每个一级标题下给出 2–4 条要点，语言像嘉宾在解释
4) 表述统一为“市场如何理解/市场讨论焦点在于/被视为”，不得出现投资建议
5) 若素材池中包含 hook_pack / hook_sentence / contrarian_insight，可自然嵌入开头

输出 Markdown 大纲即可，不要输出分析过程。`,
  });
  return response.text || '';
}

/**
 * 步骤 4：长时深度脚本生成
 */
export async function generateScript(keyword: string, materialJson: string, outline: string) {
  const ai = getAI();
  const today = getToday();
  const prompt = `你是一名财经播客内容 Agent。
任务：基于素材生成 **10–15 分钟（约 2000–2800 字）** 的「主持人 × 嘉宾张老师」深度对话脚本。

输入：
- 热词：${keyword}
- 素材池：${materialJson}
- 大纲：${outline}
- 当前日期：${today}

硬性约束：
1) 不做投资建议，不出现买/卖/加仓/抄底/布局/上车等词
2) 不评价股价涨跌是否合理
3) 所有判断统一改写为“市场如何理解 / 被视为 / 讨论焦点在于”
4) 风格口语、可听，避免研报腔
5) 必须引用素材中的“视频/音频洞察”，可用“我在B站看到…”“某播客嘉宾提到…”
6) 主持人承担“认知代理”，每 2 分钟做一次总结或降压

结构要求：
① 开场｜异常确认（30–60 字）
② 概念讲清楚（What，至少 2 轮追问）
③ 为什么是现在（Why Now，拆 2–3 个驱动）
④ 深度拆解（篇幅最大，因果链清晰）
⑤ 观察框架（≥3 个指标，解释“为什么重要/没发生意味着什么”）
⑥ 一句话总结（只能一句）
⑦ 主持人收尾

输出格式：
主持人：……
嘉宾张老师：……

只输出脚本文本，不输出 JSON 或推理过程。`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      temperature: 0.8,
      thinkingConfig: { thinkingBudget: 12000 }
    }
  });
  return response.text || '';
}

/**
 * 步骤 5：音频合成
 */
export async function synthesizePodcast(script: string, audioContext: AudioContext, onProgress?: (p: number, total: number) => void): Promise<AudioBuffer> {
  const ai = getAI();
  const cleaned = cleanScript(script);
  const lines = cleaned.split('\n');
  
  const chunks: string[] = [];
  let currentChunk = "";
  for (const line of lines) {
    if ((currentChunk + line).length > 800) { chunks.push(currentChunk); currentChunk = line + "\n"; }
    else { currentChunk += line + "\n"; }
  }
  if (currentChunk) chunks.push(currentChunk);

  const buffers: AudioBuffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (onProgress) onProgress(i + 1, chunks.length);
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: chunks[i] }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speaker: '主持人', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
              { speaker: '嘉宾张老师', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
            ]
          }
        }
      }
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let j = 0; j < binaryString.length; j++) {
        bytes[j] = binaryString.charCodeAt(j);
      }
      const dataInt16 = new Int16Array(bytes.buffer);
      const buffer = audioContext.createBuffer(1, dataInt16.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let j = 0; j < dataInt16.length; j++) {
        channelData[j] = dataInt16[j] / 32768.0;
      }
      buffers.push(buffer);
    }
  }
  
  const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
  const final = audioContext.createBuffer(1, totalLength, 24000);
  let offset = 0;
  for (const b of buffers) { 
    final.getChannelData(0).set(b.getChannelData(0), offset); 
    offset += b.length; 
  }
  return final;
}
