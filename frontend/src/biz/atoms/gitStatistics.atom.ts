import { atom } from "jotai"
import dayjs, { type Dayjs } from "dayjs"
import type {
  Repository,
  Author,
  StatisticsByRepository,
  StatisticsByDate,
  Commit,
  OvertimeMode,
} from "../../types/gitStatistics"

export interface FilterState {
  dateRange: [Dayjs, Dayjs];
  repositoryIds: string[];
  authorEmails: string[];
  overtimeMode: OvertimeMode;
}

// 默认筛选条件：最近一个月
export const defaultFilterState: FilterState = {
  dateRange: [dayjs().subtract(1, "month"), dayjs()],
  repositoryIds: [],
  authorEmails: [],
  overtimeMode: 'all'
};

export const filterAtom = atom<FilterState>(defaultFilterState);

export interface CommitsTableState {
  data: Commit[]
  loading: boolean
  pagination: {
    current: number
    pageSize: number
    total: number
  }
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
  totalCommits: number
  totalInsertions: number
  totalDeletions: number
  totalFilesChanged: number
  byRepository: StatisticsByRepository[]
  byDate: StatisticsByDate[]
}

export const statisticsAtom = atom<StatisticsState>({
  totalCommits: 0,
  totalInsertions: 0,
  totalDeletions: 0,
  totalFilesChanged: 0,
  byRepository: [],
  byDate: []
});

export const repositoriesAtom = atom<Repository[]>([])

export const authorsAtom = atom<Author[]>([])
