import dayjs, { type Dayjs } from 'dayjs'

/** 手动扫描可选的时间范围维度（多选后取并集） */
export type ScanTimePresetKey =
  | 'two_weeks'
  | 'one_month'
  | 'three_months'
  | 'six_months'
  | 'filter_range'

export const SCAN_TIME_PRESET_OPTIONS: { value: ScanTimePresetKey; label: string }[] = [
  { value: 'two_weeks', label: '近 2 周' },
  { value: 'one_month', label: '近 1 个月' },
  { value: 'three_months', label: '近 3 个月' },
  { value: 'six_months', label: '近 6 个月' },
  { value: 'filter_range', label: '当前筛选日期' }
]

/** 与 backend ScanRequestSchema 一致 */
export const MAX_SCAN_SPAN_MS = 186 * 24 * 60 * 60 * 1000

export function getPresetRange(
  key: ScanTimePresetKey,
  filterDateRange: [Dayjs, Dayjs]
): [number, number] {
  const end = dayjs().endOf('day')
  switch (key) {
    case 'two_weeks':
      return [dayjs().subtract(14, 'day').startOf('day').valueOf(), end.valueOf()]
    case 'one_month':
      return [dayjs().subtract(1, 'month').startOf('day').valueOf(), end.valueOf()]
    case 'three_months':
      return [dayjs().subtract(3, 'month').startOf('day').valueOf(), end.valueOf()]
    case 'six_months':
      return [dayjs().subtract(6, 'month').startOf('day').valueOf(), end.valueOf()]
    case 'filter_range':
      return [
        filterDateRange[0].startOf('day').valueOf(),
        filterDateRange[1].endOf('day').valueOf()
      ]
  }
}

export function mergeMsRanges(ranges: [number, number][]): [number, number] {
  let start = ranges[0][0]
  let end = ranges[0][1]
  for (let i = 1; i < ranges.length; i++) {
    start = Math.min(start, ranges[i][0])
    end = Math.max(end, ranges[i][1])
  }
  return [start, end]
}
