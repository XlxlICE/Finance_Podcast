
import { GoogleGenAI, Type, Modality } from "@google/genai";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Strips AI meta-commentary and only keeps lines starting with Speaker names.
 * Handles both Chinese and English colons.
 */
export function cleanScript(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  const dialogueLines = lines.filter(line => {
    const trimmed = line.trim();
    // Match common speaker patterns like "小王:", "张老师:", "小王：", "张老师："
    return /^[^：:]+[：:]/.test(trimmed);
  });
  return dialogueLines.join('\n');
}

export async function generateEpisodeTitle(keyword: string, insights: string[]) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `请为关于“${keyword}”的财经播客起一个极具吸引力、专业的标题。参考爆点：${insights.join('; ')}。
    要求：
    1. 简洁有力，有点击欲望。
    2. 只输出【一个】标题文字。
    3. 不要输出“标题1、标题2”这种列表。
    4. 不要任何前缀或引言。`,
  });
  // Take only the first non-empty line and strip markdown/quotes
  const title = response.text?.split('\n').find(l => l.trim().length > 0) || `${keyword} 深度观察`;
  return title.replace(/[#*"]/g, '').trim();
}

export async function collectMaterials(keyword: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `关于财经热点词“${keyword}”，请深入搜集相关素材。重点关注：1. 核心政策导向 2. 产业利润池变化 3. 权力结构与核心矛盾 4. 关键财务指标。请提供详细的事实依据，并明确区分来源类型。`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const metadata = response.candidates?.[0]?.groundingMetadata;
  const links: { title: string; uri: string; type: 'web' }[] = [];

  if (metadata?.groundingChunks) {
    metadata.groundingChunks.forEach((chunk: any) => {
      if (chunk.web) {
        links.push({
          title: chunk.web.title || '参考来源',
          uri: chunk.web.uri,
          type: 'web'
        });
      }
    });
  }

  return {
    text: response.text || '未能获取到详细素材。',
    links,
  };
}

export async function designInsights(materials: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `基于以下素材，设计3-5个财经播客的“爆点”。要求包括：开场金句、精妙类比、或者一个反常识的洞察（Insight）。素材内容：\n${materials}`,
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
    contents: `请为关于“${keyword}”的财经播客生成一份逻辑大纲。要求：1. 明确因果路径 2. 确定解释顺序 3. 列出关键观察指标。已有的核心爆点：${insights.join('; ')}`,
  });
  return response.text || '';
}

export async function generateScript(outline: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `请将以下播客大纲转化为“小王”与“张老师”的对话脚本。
    要求：
    1. 风格专业通俗，避免数字堆砌。
    2. 严格按格式输出（使用中文冒号）：
       小王：[话语]
       张老师：[话语]
    3. 只输出对话内容，不要任何开场白、介绍或制作人注释。
    
    大纲：
    ${outline}`,
  });
  return cleanScript(response.text || '');
}

export async function reviewAndRefine(script: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `作为资深播客制作人，请优化以下脚本：
    1. 修复僵硬提问。
    2. 扁平化复杂术语。
    3. 清理投资建议。
    4. 严格禁令：不要输出任何“制作人注释”、“优化逻辑说明”、“你好作为制作人”等元对话。
    5. 只输出最终的【纯对话脚本】，不要标题，不要总结。
    
    待审核脚本：
    ${script}`,
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
  // Prepend a short intro for comfort
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
  if (!base64Audio) throw new Error("音频合成失败 - 未能获取音频数据");

  return await decodeAudioData(
    decode(base64Audio),
    audioContext,
    24000,
    1
  );
}

export function bufferToWav(buffer: AudioBuffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); 
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); 
  setUint16(1); 
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);

  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  for (i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

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

  function setUint16(data: any) {
    view.setUint16(pos, data, true);
    pos += 2;
  }
  function setUint32(data: any) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}
