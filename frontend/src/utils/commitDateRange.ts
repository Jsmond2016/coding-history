import dayjs, { type Dayjs } from "dayjs"

export type CommitDateRange = [Dayjs, Dayjs]

export const createCommitDateRangePresets = (allTimeRange: CommitDateRange | null) => [
  { label: "最近一周", value: [dayjs().subtract(7, "day"), dayjs()] as CommitDateRange },
  { label: "最近一个月", value: [dayjs().subtract(1, "month"), dayjs()] as CommitDateRange },
  { label: "最近三个月", value: [dayjs().subtract(3, "month"), dayjs()] as CommitDateRange },
  { label: "最近半年", value: [dayjs().subtract(6, "month"), dayjs()] as CommitDateRange },
  { label: "最近一年", value: [dayjs().subtract(1, "year"), dayjs()] as CommitDateRange },
  ...(allTimeRange ? [{ label: "全部时间", value: allTimeRange }] : []),
]
