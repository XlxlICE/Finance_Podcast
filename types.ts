
export enum WorkflowStep {
  IDLE = 'IDLE',
  TRIGGER = 'TRIGGER',
  RESEARCH = 'RESEARCH',
  INSIGHTS = 'INSIGHTS',
  OUTLINE = 'OUTLINE',
  DRAFTING = 'DRAFTING',
  REVIEW = 'REVIEW',
  SYNTHESIS = 'SYNTHESIS',
  COMPLETED = 'COMPLETED'
}

export interface PodcastContent {
  keyword: string;
  title?: string;
  materials?: string;
  hooks?: string[];
  outline?: string;
  draftScript?: string;
  finalScript?: string;
  audioBuffer?: AudioBuffer;
  groundingLinks?: { title: string; uri: string; type?: 'web' | 'video' | 'news' }[];
}

export interface StepStatus {
  step: WorkflowStep;
  label: string;
  icon: string;
  description: string;
}
