import { atom } from "jotai"
import dayjs, { type Dayjs } from "dayjs"
import type {
  Repository,
  Author,
  StatisticsByRepository,
  StatisticsByDate,
  Commit,
} from "../../types/gitStatistics"

export interface FilterState {
  dateRange: [Dayjs, Dayjs];
  repositoryIds: string[];
  authorEmails: string[];
  isOvertime?: boolean; // 筛选是否加班：undefined=全部，true=仅加班，false=非加班
}

// 默认筛选条件：最近一个月
export const defaultFilterState: FilterState = {
  dateRange: [dayjs().subtract(1, "month"), dayjs()],
  repositoryIds: [],
  authorEmails: [],
  isOvertime: undefined
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

