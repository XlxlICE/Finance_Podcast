
import { WorkflowStep, StepStatus } from './types';

export const STEPS_CONFIG: StepStatus[] = [
  {
    step: WorkflowStep.TRIGGER,
    label: '热词触发',
    icon: 'fa-bolt',
    description: '感知市场异常与核心热词'
  },
  {
    step: WorkflowStep.RESEARCH,
    label: '素材搜集',
    icon: 'fa-magnifying-glass-chart',
    description: '穿透政策、产业、利润池'
  },
  {
    step: WorkflowStep.INSIGHTS,
    label: '爆点设计',
    icon: 'fa-lightbulb',
    description: '提炼金句与反常识洞察'
  },
  {
    step: WorkflowStep.OUTLINE,
    label: '大纲生成',
    icon: 'fa-list-check',
    description: '构建15分钟逻辑因果链'
  },
  {
    step: WorkflowStep.DRAFTING,
    label: '初稿生成',
    icon: 'fa-pen-nib',
    description: '主持人×嘉宾对话脚本'
  },
  {
    step: WorkflowStep.REVIEW,
    label: '听感合规',
    icon: 'fa-shield-check',
    description: '去僵硬、去投资暗示'
  },
  {
    step: WorkflowStep.SYNTHESIS,
    label: '音频合成',
    icon: 'fa-microphone-lines',
    description: '双人专业音频播客合成'
  }
];
