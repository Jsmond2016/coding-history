import { atom } from "jotai"
import dayjs, { type Dayjs } from "dayjs"
import type {
  CommitsByDate,
  DataOverviewResponse,
  WorkIntensity,
  WorkStatusMetricsConfig,
} from "../../types/gitStatistics"
import { defaultFilterState, type FilterState } from "./gitStatistics.atom"

export interface OverviewFilter {
  dateRange: [Dayjs, Dayjs]
  repositoryIds: string[]
  authorEmails: string[]
}

export type OverviewDrilldownKey =
  | "totalCommits"
  | "activeDays"
  | "overtimeDays"
  | "overtimeCommits"
  | "topOvertimeMonth"
  | `intensity:${WorkIntensity}`
  | `repository:${string}`

export const defaultOverviewFilter: OverviewFilter = {
  dateRange: [dayjs().subtract(1, "month"), dayjs()],
  repositoryIds: [],
  authorEmails: [],
}

export const dataOverviewFilterAtom = atom<OverviewFilter>(defaultOverviewFilter)
export const dataOverviewAppliedFilterAtom = atom<OverviewFilter>(defaultOverviewFilter)
export const dataOverviewHydratedAtom = atom(false)

export interface DataOverviewViewState {
  overview: DataOverviewResponse | null
  activeCard: OverviewDrilldownKey | null
  detailGroups: CommitsByDate[]
  detailTitle: string
}

export const dataOverviewViewAtom = atom<DataOverviewViewState>({
  overview: null,
  activeCard: null,
  detailGroups: [],
  detailTitle: "选择指标或仓库查看提交明细",
})

export const gitStatisticsAppliedFilterAtom = atom<FilterState>(defaultFilterState)
export const gitStatisticsHydratedAtom = atom(false)

export interface GitStatisticsViewState {
  commitsByDate: CommitsByDate[]
  workStatusGroups: CommitsByDate[]
  metricsConfig: WorkStatusMetricsConfig | null
  loadError: string | null
  lastUpdatedAt: number | null
}

export const gitStatisticsViewAtom = atom<GitStatisticsViewState>({
  commitsByDate: [],
  workStatusGroups: [],
  metricsConfig: null,
  loadError: null,
  lastUpdatedAt: null,
})
