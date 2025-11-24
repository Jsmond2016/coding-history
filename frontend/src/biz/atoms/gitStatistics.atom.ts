import { atom } from 'jotai';
import dayjs, { type Dayjs } from 'dayjs';

export interface FilterState {
  dateRange: [Dayjs, Dayjs];
  repositoryIds: string[];
  isOvertime?: boolean; // 筛选是否加班：undefined=全部，true=仅加班，false=非加班
}

// 默认筛选条件：最近一周
export const defaultFilterState: FilterState = {
  dateRange: [dayjs().subtract(7, 'day'), dayjs()],
  repositoryIds: [],
  isOvertime: undefined
};

export const filterAtom = atom<FilterState>(defaultFilterState);

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

