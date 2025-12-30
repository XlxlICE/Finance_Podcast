
import { GoogleGenAI, Type, Modality } from "@google/genai";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * 清洗脚本：提取对话行，兼容中英文冒号
 */
export function cleanScript(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  const dialogueLines = lines.filter(line => {
    const trimmed = line.trim();
    return /^[^：:]+[：:]/.test(trimmed);
  });
  return dialogueLines.join('\n');
}

/**
 * 步骤 0：识别热词类型（个股 vs 产业）
 */
async function identifyCategory(keyword: string): Promise<'STOCK' | 'INDUSTRY'> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `判断以下财经热词属于“个股/具体公司”还是“宏观产业/行业板块/主题概念”：
    热词：“${keyword}”
    只需回复单词：STOCK 或 INDUSTRY。`,
  });
  const result = response.text?.trim().toUpperCase();
  return result?.includes('STOCK') ? 'STOCK' : 'INDUSTRY';
}

/**
 * 优化后的核心素材搜集函数
 */
export async function collectMaterials(keyword: string) {
  const category = await identifyCategory(keyword);
  const ai = getAI();
  const today = new Date().toISOString().split('T')[0];

  // 构建定向搜索提示词
  let systemPrompt = '';
  if (category === 'STOCK') {
    systemPrompt = `你是一名“公司研究与商业叙事编辑”。任务：基于个股热词“${keyword}”，结合当前日期 ${today} 附近的公开信息，完成公司类型识别并输出“故事化素材池”。
    
    【强制搜索要求】你必须利用工具搜索并列出以下参考链接：
    1. 视频：YouTube/Bilibili 深度拆解视频。
    2. 音频：小宇宙/喜马拉雅/播客讨论。
    3. 文本：财报、公告或核心财讯。

    【输出结构要求】（严格遵守以下 JSON 逻辑）：
    - company_type: (转型重生/顺周期/政策路径/技术突破/平台化)
    - material_pool: {
        hook_pack: 开场类比,
        why_people_talk_now: 最近讨论焦点,
        timeline: [时间线数组],
        turning_points: 关键转折,
        core_tensions: 核心矛盾,
        profit_pool_shift: 利润池变化,
        constraints_today: 当前约束,
        validation_metrics: 观察指标
    }
    请在回答中包含所有搜索到的 URL。`;
  } else {
    systemPrompt = `你是一名“深度产业研究编辑 + 不确定性展开型信息整合 Agent”。任务：针对热词“${keyword}”，展开财经热词的“解释空间”。
    
    【强制搜索要求】你必须利用工具搜索并提供：
    1. 视频：行业深度观察视频（B站/YouTube）。
    2. 音频：播客节目中的行业讨论。
    3. 文本：券商研报、政策原文、行业深度社论。

    【输出结构要求】：
    - industry_type: (技术范式/供需周期/政策驱动/重资产制造/平台生态)
    - alternative_explanations: 2-4条并行的解释轴（政策轴、成本轴、对标轴等）
    - material_pool: {
        definition: 定义,
        core_tensions: 核心矛盾,
        power_structure: 权力结构,
        profit_pool: 利润池与订单流,
        irreversibles: 不可逆趋势,
        validation_metrics: 验证点,
        risks: 风险点
    }
    请在回答中包含所有搜索到的 URL。`;
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: systemPrompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const metadata = response.candidates?.[0]?.groundingMetadata;
  const linksMap = new Map<string, { title: string; uri: string; type: 'web' | 'video' | 'news' }>();

  // 链接分类逻辑
  const categorize = (url: string, title: string): 'web' | 'video' | 'news' => {
    const lowUrl = url.toLowerCase();
    const lowTitle = title.toLowerCase();
    if (lowUrl.includes('youtube.com') || lowUrl.includes('bilibili.com') || lowTitle.includes('视频')) return 'video';
    if (lowUrl.includes('podcast') || lowUrl.includes('xiaoyuzhou') || lowTitle.includes('播客') || lowTitle.includes('音频')) return 'news';
    return 'web';
  };

  // 提取 Grounding 链接
  if (metadata?.groundingChunks) {
    metadata.groundingChunks.forEach((chunk: any) => {
      if (chunk.web && chunk.web.uri) {
        linksMap.set(chunk.web.uri, {
          title: chunk.web.title || '深度参考',
          uri: chunk.web.uri,
          type: categorize(chunk.web.uri, chunk.web.title || '')
        });
      }
    });
  }

  // 正则兜底提取 text 中的 URL
  const text = response.text || '';
  const urlRegex = /(https?:\/\/[^\s\)\],]+)/g;
  const foundUrls = text.match(urlRegex);
  if (foundUrls) {
    foundUrls.forEach(url => {
      const cleanUrl = url.replace(/[.\u3002]$/, '');
      if (!linksMap.has(cleanUrl)) {
        linksMap.set(cleanUrl, { title: '参考来源', uri: cleanUrl, type: categorize(cleanUrl, '') });
      }
    });
  }

  return {
    text: text,
    links: Array.from(linksMap.values()),
    category: category
  };
}

export async function generateEpisodeTitle(keyword: string, insights: string[]) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `请为关于“${keyword}”的财经播客起一个极具吸引力、专业的标题。参考爆点：${insights.join('; ')}。
    要求：只输出【一个】标题文字，绝对不要列表。不要前缀。`,
  });
  return (response.text?.split('\n').find(l => l.trim().length > 0) || `${keyword} 深度观察`).replace(/[#*"]/g, '').trim();
}

export async function designInsights(materials: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `基于以下素材，设计3-5个财经播客的“爆点”。要求：开场金句、精妙类比、或者一个反常识的洞察（Insight）。素材内容：\n${materials}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });
  try {
    return JSON.parse(response.text || '[]');
  } catch (e) {
    return [];
  }
}

export async function generateOutline(keyword: string, insights: string[]) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `请为关于“${keyword}”的财经播客生成一份逻辑大纲。要求：1. 明确因果路径 2. 确定解释顺序 3. 列出关键观察指标。参考爆点：${insights.join('; ')}`,
  });
  return response.text || '';
}

export async function generateScript(outline: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `将以下大纲转化为“小王”与“张老师”的对话脚本。
    格式：
    小王：[话语]
    张老师：[话语]
    大纲：\n${outline}`,
  });
  return cleanScript(response.text || '');
}

export async function reviewAndRefine(script: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `作为资深播客制作人，请优化以下脚本：去术语化，让对话像老友聊天。禁止输出非对话内容。\n${script}`,
  });
  return cleanScript(response.text || '');
}

// Audio Utilities
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export async function synthesizePodcast(script: string, audioContext: AudioContext): Promise<AudioBuffer> {
  const ai = getAI();
  const cleanDialogue = cleanScript(script);
  const podcastText = `FinancePod AI 特约报道。${cleanDialogue.substring(0, 1500)}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: podcastText }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: '小王',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
            },
            {
              speaker: '张老师',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
            }
          ]
        }
      }
    }
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("音频合成失败");

  return await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
}

export function bufferToWav(buffer: AudioBuffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
  let i, sample, offset = 0, pos = 0;

  const setUint16 = (data: any) => { view.setUint16(pos, data, true); pos += 2; };
  const setUint32 = (data: any) => { view.setUint32(pos, data, true); pos += 4; };

  setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157);
  setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
  setUint32(buffer.sampleRate); setUint32(buffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2); setUint16(16);
  setUint32(0x61746164); setUint32(length - pos - 4);

  for (i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }
  return new Blob([bufferArr], { type: "audio/wav" });
}
