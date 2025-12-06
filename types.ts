export interface Note {
  id: string;
  title: string;
  content: string;
  lastModified: number;
}

export interface Link {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: { id: string; group: number }[];
  links: Link[];
}

export interface DriveResponse {
  status: string;
  error?: string;
}

export enum ViewMode {
  EDITOR = 'EDITOR',
  GRAPH = 'GRAPH',
  SPLIT = 'SPLIT'
}
