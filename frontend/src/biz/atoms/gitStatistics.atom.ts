import { atom } from 'jotai';
import dayjs, { type Dayjs } from 'dayjs';

export type QuickSelectType = 'week' | 'month' | 'custom';

export interface FilterState {
  dateRange: [Dayjs, Dayjs];
  repositoryIds: string[];
  quickSelect: QuickSelectType;
}

export const filterAtom = atom<FilterState>({
  dateRange: [dayjs().subtract(7, 'day'), dayjs()],
  repositoryIds: [],
  quickSelect: 'week'
});

export interface CommitsTableState {
  data: any[];
  loading: boolean;
  pagination: {
    current: number;
    pageSize: number;
    total: number;
  };
}

export const commitsTableAtom = atom<CommitsTableState>({
  data: [],
  loading: false,
  pagination: {
    current: 1,
    pageSize: 20,
    total: 0
  }
});

export interface StatisticsState {
  totalCommits: number;
  totalInsertions: number;
  totalDeletions: number;
  totalFilesChanged: number;
  byRepository: any[];
  byDate: any[];
}

export const statisticsAtom = atom<StatisticsState>({
  totalCommits: 0,
  totalInsertions: 0,
  totalDeletions: 0,
  totalFilesChanged: 0,
  byRepository: [],
  byDate: []
});

export const repositoriesAtom = atom<any[]>([]);

