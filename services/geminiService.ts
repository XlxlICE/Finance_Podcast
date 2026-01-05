
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
 * 获取热搜榜单
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
      ths: ["中际旭创", "工业母机", "低空经济", "宁德时代", "利欧股份"],
      xq: ["人形机器人", "高股息资产", "英稳达", "腾讯控股", "贵州茅台"],
      dfcf: ["固态电池", "券商板块", "白酒龙头", "半导体国产化", "创新药"]
    };
  }
}

/**
 * 获取今日重大财经大事
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
      { title: "多家蓝筹股发布分红方案", summary: "高股息策略成为当前市场避险情绪的首选路径。" }
    ];
  }
}

async function deepDiveLink(url: string, title: string, instruction: string): Promise<string> {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `针对链接: "${url}" (标题: ${title})。\n任务指导: ${instruction}\n请通过搜索该链接的网页快照、转录文本、笔记分享或评论总结，提取其高密度的核心内容。`,
      config: { tools: [{ googleSearch: {} }] }
    });
    return `[来自深度解析: ${title}]\n${response.text}\n\n`;
  } catch {
    return "";
  }
}

/**
 * 步骤 1：素材搜集（支持：个股、产业、经济事件三类）
 */
export async function collectMaterials(keyword: string, onProgress?: (msg: string) => void) {
  const ai = getAI();
  const today = getToday();

  const prompt = `你是一名“财经研究 + 叙事素材整合”编辑。
任务：针对关键词“${keyword}”，结合联网搜索与公开资料，在 ${today} 前后可验证信息的基础上，输出可用于播客的“故事化素材池”。

总原则（必须遵守）：
1) 不输出任何投资建议，不出现买/卖/加仓/抄底/布局/上车等词
2) 不评价股价涨跌是否合理
3) 所有判断统一改写为“市场如何理解 / 市场讨论焦点在于 / 被视为”
4) 允许叙事化表达，但必须克制、可回溯
5) 不凭空发挥，必须基于可验证线索
6) 最终只输出严格 JSON，不输出 Markdown 或工具细节

步骤：
1) 先判断热词类型：个股 / 产业 / 经济事件
2) 针对类型输出素材池 JSON（字段缺失可用空数组/空字符串，禁止编造）

如果是【个股】：
输出 JSON 结构：
{
  "hotword_type": "个股",
  "company_type": "转型重生型/顺周期扩张型/政策路径型/技术突破型/平台化演进型",
  "material_pool": {
    "hook_pack": "一句开场狠话/类比/反常识点",
    "one_sentence_identity": "一句话公司身份",
    "why_people_talk_now": ["原因"],
    "timeline": [{"date": "...", "event": "..."}],
    "original_business_model": "业务描述",
    "core_tensions": ["核心矛盾"],
    "validation_metrics": ["监控指标"],
    "risks_and_uncertainty": ["风险点"]
  }
}

如果是【产业/概念】：
输出 JSON 结构：
{
  "hotword_type": "产业",
  "industry_type": "技术范式型/供需周期型/政策驱动型/重资产制造型/平台生态型",
  "material_pool": {
    "definition": "边界定义",
    "core_tensions": ["关键矛盾"],
    "profit_pool_and_orders": "利润来源变化",
    "value_migration": "价值迁移路径",
    "validation_metrics": ["监控指标"],
    "alternative_explanations": [{"angle": "视角", "core_fact_or_conflict": "事实"}]
  }
}

如果是【经济事件/宏观】：
输出 JSON 结构：
{
  "hotword_type": "经济事件",
  "event_nature": "政策导向/市场异动/全球博弈/宏观指标",
  "material_pool": {
    "event_core": "事件核心定义",
    "why_it_matters": "为什么它是现在的焦点",
    "stakeholders": ["核心利益相关方及立场"],
    "historical_precedent": "历史类似事件对比",
    "structural_reasons": "背后的深层结构化原因",
    "chain_reaction": ["可能引发的连锁反应"],
    "observation_window": ["关键观察时间点/信号"]
  }
}

注意：只输出 JSON，信息密度高但语言克制。`;

  if (onProgress) onProgress("正在检索多模态素材并识别引用源...");

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
  
  const links: { title: string; uri: string; type: 'web' | 'video' | 'news' }[] = metadata?.groundingChunks?.map((chunk: any) => {
    const uri = String(chunk.web?.uri || "");
    const title = String(chunk.web?.title || '深度参考');
    let type: 'web' | 'video' | 'news' = 'web';
    const videoDomains = ['youtube.com', 'bilibili.com', 'v.qq.com', 'douyin.com', 'xiaoyuzhoufm.com', 'podcast'];
    if (videoDomains.some(d => uri.toLowerCase().includes(d))) type = 'video';
    else if (uri.includes('/news/') || uri.includes('stock')) type = 'news';
    return { title, uri, type };
  }) || [];

  const mediaLinks = links.filter(l => l.type === 'video').slice(0, 2);
  if (mediaLinks.length > 0) {
    if (onProgress) onProgress(`识别到 ${mediaLinks.length} 个音视频源，正在执行深度穿透抽取...`);
    let extraInsights = "\n\n--- 深度内容抽取补充 ---\n";
    for (const link of mediaLinks) {
      const insight = await deepDiveLink(link.uri, link.title, "寻找该视频的 Transcript、核心论点、金句以及高质量总结。");
      extraInsights += insight;
    }
    
    try {
      const parsed = JSON.parse(materialJson);
      if (parsed.material_pool) {
        parsed.material_pool.deep_insights_supplement = extraInsights;
        materialJson = JSON.stringify(parsed);
      }
    } catch {
      materialJson += extraInsights;
    }
  }

  let finalLinks = links;
  if (links.length === 0) {
    onProgress?.("正在补全引用源...");
    const fallback = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `列出关于“${keyword}”的 3 个高质量参考 URL（包括 Bilibili 视频、深度文章、新闻）。`,
      config: { tools: [{ googleSearch: {} }] }
    });
    finalLinks = fallback.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
      title: String(chunk.web?.title || "参考来源"),
      uri: String(chunk.web?.uri || ""),
      type: (chunk.web?.uri || "").includes("video") ? "video" : "web" as any
    })) || [];
  }

  return { materialJson, links: finalLinks };
}

/**
 * 步骤 2：爆点设计
 */
export async function generateHighlightsAndHooks(keyword: string, materialJson: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `基于“${keyword}”的素材池：${materialJson}\n任务：生成播客第一句话、类比、反常识洞察、3条金句和3个制作亮点。只输出 JSON。`,
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
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
 * 步骤 3：大纲生成
 */
export async function generateOutline(keyword: string, materialJson: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `针对关键词“${keyword}”，基于素材池：${materialJson}\n生成一份详细的对话大纲。`,
  });
  return response.text || '';
}

/**
 * 步骤 4：标题生成
 */
export async function generateEpisodeTitle(keyword: string, hooks: string[]): Promise<string> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `基于“${keyword}”和这些金句：\n${hooks.join('\n')}\n任务：生成【一个】最吸引人的播客标题。约束：只返回标题文本本身，不要多余字符。`,
  });
  return response.text?.replace(/["'“”]/g, '').trim() || `${keyword} 深度解读`;
}

/**
 * 步骤 5：对话脚本生成（强化：个股/产业/事件三位一体）
 */
export async function generateScript(keyword: string, materialJson: string, outline: string) {
  const ai = getAI();
  const today = getToday();

  const prompt = `你是一名“财经播客脚本生成 Agent”，专门负责关于“${keyword}”的深度对谈。

任务：
基于以下关于“${keyword}”的素材，生成一篇 **10–15 分钟（约 2000–2800 字）** 的「主持人 × 嘉宾」对话式财经播客脚本。

========================
【强约束：开场白要求】
========================
脚本必须直接以对话开始。在主持人的第一段话中，必须完成以下任务：
1. **明确宣告主题**：告诉听众今天的主角是“${keyword}”。
2. **说明讨论缘由**：简述为什么现在要聊这个话题（结合当前市场热度/事件突发性）。
3. **内容预告（纲要化）**：明确指出接下来会从哪 3-4 个维度或方面展开深度拆解。

========================
【核心纪律（必须内化）】
========================
1. **严禁偏离主题**：所有的讨论内容必须严格围绕“${keyword}”展开。如果是经济事件，则讨论该事件的影响力；如果是产业，则讨论产业逻辑。严禁跨领域胡乱联想。
2. **拒绝投资建议**：不评价股价涨跌是否合理，不出现 买/卖/加仓/抄底/布局 等词。
3. **主持人角色**：普通听众的代言人。负责追问、承接、澄清。
4. **对话格式**：严格使用“主持人：...”和“嘉宾：...”格式。
5. **纯净输出**：只输出对话正文，不输出分析、脚注或 [脚本开始] 等标记。

========================
【素材与大纲】
========================
素材池：${materialJson}
大纲参考：${outline}

生成字数：2000-2800字。
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: prompt,
    config: {
      temperature: 0.7,
      thinkingConfig: { thinkingBudget: 12000 },
    },
  });

  return response.text || "";
}

/**
 * 步骤 6：音频合成
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
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: chunks[i] }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                { speaker: '主持人', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                { speaker: '嘉宾', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
              ]
            }
          }
        }
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let j = 0; j < binaryString.length; j++) bytes[j] = binaryString.charCodeAt(j);
        const dataInt16 = new Int16Array(bytes.buffer);
        if (dataInt16.length > 0) {
          const buffer = audioContext.createBuffer(1, dataInt16.length, 24000);
          const channelData = buffer.getChannelData(0);
          for (let j = 0; j < dataInt16.length; j++) channelData[j] = dataInt16[j] / 32768.0;
          buffers.push(buffer);
        }
      }
    } catch (err) {
      console.warn(`Chunk ${i} failed, skipping...`, err);
    }
  }

  if (buffers.length === 0) throw new Error("音频合成失败，请重试。");
  const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
  const final = audioContext.createBuffer(1, totalLength, 24000);
  let offset = 0;
  for (const b of buffers) { final.getChannelData(0).set(b.getChannelData(0), offset); offset += b.length; }
  return final;
}
