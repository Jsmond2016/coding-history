import React from 'react'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { Card, Col, Row, Space, Statistic, Tabs, Tag, Tooltip, Typography } from 'antd'
import { Line } from '@ant-design/charts'
import dayjs, { type Dayjs } from 'dayjs'
import type { CommitsByDate, OvertimeMode, WorkStatusMetricsConfig } from '../../../../types/gitStatistics'

interface WorkStatusReportProps {
  data: CommitsByDate[]
  dateRange: [Dayjs, Dayjs]
  overtimeMode: OvertimeMode
}

const shortDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  month: '2-digit',
  day: '2-digit',
})
const fullDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function toShanghaiDate(date: string): Date {
  return new Date(`${date}T00:00:00+08:00`)
}

function getTrendTitle(overtimeMode: OvertimeMode): string {
  if (overtimeMode === 'overtime_commits') return '加班提交趋势'
  if (overtimeMode === 'overtime_days') return '加班日期提交趋势'
  if (overtimeMode === 'non_overtime_days') return '非加班日期提交趋势'
  return '提交次数趋势'
}

const weekDayLabels = ['一', '二', '三', '四', '五', '六', '日']
const calendarDayCellClassName = 'h-full min-h-3 w-full min-w-3 rounded-[3px] border border-black/5'
const calendarLegendCellClassName = 'h-3 w-3 rounded-[3px] border border-black/5'

function getMondayOffset(date: Dayjs): number {
  const day = date.day()
  return day === 0 ? 6 : day - 1
}

function getCalendarLevel(totalCommits: number): 0 | 1 | 2 | 3 | 4 {
  if (totalCommits <= 0) return 0
  if (totalCommits <= 2) return 1
  if (totalCommits <= 5) return 2
  if (totalCommits <= 10) return 3
  return 4
}

function getCalendarColor(totalCommits: number): string {
  const colors = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
  return colors[getCalendarLevel(totalCommits)]
}

interface CalendarDay {
  date: string
  totalCommits: number
  inRange: boolean
}

interface CommitCalendarProps {
  chartData: Array<{ date: string; totalCommits: number }>
  dateRange: [Dayjs, Dayjs]
}

const CommitCalendar: React.FC<CommitCalendarProps> = ({ chartData, dateRange }) => {
  const countByDate = React.useMemo(() => new Map(
    chartData.map((item) => [item.date, item.totalCommits]),
  ), [chartData])
  const weeks = React.useMemo(() => {
    const start = dateRange[0].startOf('day')
    const end = dateRange[1].startOf('day')
    const calendarStart = start.subtract(getMondayOffset(start), 'day')
    const calendarEnd = end.add(6 - getMondayOffset(end), 'day')
    const result: CalendarDay[][] = []
    let weekCursor = calendarStart

    while (!weekCursor.isAfter(calendarEnd)) {
      const days = Array.from({ length: 7 }, (_, index) => {
        const current = weekCursor.add(index, 'day')
        const date = current.format('YYYY-MM-DD')
        const inRange = !current.isBefore(start) && !current.isAfter(end)
        return {
          date,
          totalCommits: inRange ? countByDate.get(date) ?? 0 : 0,
          inRange,
        }
      })
      result.push(days)
      weekCursor = weekCursor.add(7, 'day')
    }

    return result
  }, [countByDate, dateRange])

  const monthLabels = React.useMemo(() => weeks.map((week, index) => {
    const monthStart = week.find((day) => day.inRange && dayjs(day.date).date() === 1)
    const labelDay = monthStart ?? (index === 0 ? week.find((day) => day.inRange) : undefined)
    return labelDay ? `${dayjs(labelDay.date).month() + 1}月` : ''
  }), [weeks])

  const totalCommits = chartData.reduce((sum, item) => sum + item.totalCommits, 0)
  const activeDays = chartData.filter((item) => item.totalCommits > 0).length
  const weekColumnMinWidth = 16
  const gridTemplateColumns = `repeat(${weeks.length}, minmax(${weekColumnMinWidth}px, 1fr))`
  const gridTemplateRows = 'repeat(7, minmax(0, 1fr))'

  return (
    <div className="flex h-[300px] flex-col">
      <div className="min-h-0 min-w-0 flex-1 overflow-x-auto pb-3">
        <div
          className="grid h-full min-w-full gap-x-2 gap-y-[3px]"
          style={{
            gridTemplateColumns: `24px minmax(${weeks.length * weekColumnMinWidth}px, 1fr)`,
            gridTemplateRows: '20px minmax(0, 1fr)',
          }}
        >
          <div />
          <div className="grid h-5 gap-[3px] text-xs text-neutral-500" style={{ gridTemplateColumns }}>
            {monthLabels.map((label, index) => (
              <span key={`${label}-${index}`} className="whitespace-nowrap leading-4">
                {label}
              </span>
            ))}
          </div>

          <div
            className="grid h-full gap-[3px] pr-2 text-right text-xs text-neutral-500"
            style={{ gridTemplateRows }}
          >
            {weekDayLabels.map((label) => (
              <span key={label} className="flex items-center justify-end">{label}</span>
            ))}
          </div>
          <div
            className="grid h-full grid-flow-col gap-[3px]"
            style={{ gridTemplateColumns, gridTemplateRows }}
          >
            {weeks.flatMap((week) => week.map((day) => {
              const color = day.inRange ? getCalendarColor(day.totalCommits) : 'transparent'
              return (
                <Tooltip
                  key={day.date}
                  title={day.inRange ? `${fullDateFormatter.format(toShanghaiDate(day.date))}：${day.totalCommits} 次提交` : null}
                >
                  <span
                    aria-label={day.inRange ? `${day.date} ${day.totalCommits} 次提交` : undefined}
                    className={calendarDayCellClassName}
                    style={{
                      backgroundColor: color,
                      borderColor: day.inRange ? 'rgba(27, 31, 35, 0.06)' : 'transparent',
                    }}
                  />
                </Tooltip>
              )
            }))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3">
        <Typography.Text type="secondary">
          {activeDays} 个活跃日 · {totalCommits} 次提交
        </Typography.Text>
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>少</span>
          {[0, 1, 3, 6, 11].map((count) => (
            <span
              key={count}
              className={calendarLegendCellClassName}
              style={{ backgroundColor: getCalendarColor(count) }}
            />
          ))}
          <span>多</span>
        </div>
      </div>
    </div>
  )
}

export const WorkStatusCards: React.FC<{
  data: CommitsByDate[]
  metricsConfig: WorkStatusMetricsConfig | null
}> = ({ data, metricsConfig }) => {
  if (!data.length) return null

  const thresholds = metricsConfig?.thresholds ?? {
    relaxed: 6,
    normal: 10,
    busy: 15,
    superCrazy: 20,
  }
  const intensity = data.reduce((result, group) => {
    if (group.totalCommits < thresholds.relaxed) result.relaxed += 1
    else if (group.totalCommits < thresholds.normal) result.normal += 1
    else if (group.totalCommits < thresholds.busy) result.busy += 1
    else result.crazy += 1
    return result
  }, { relaxed: 0, normal: 0, busy: 0, crazy: 0 })
  const overtimeDays = data.filter((group) => group.overtimeCount > 0).length
  const tenureDays = metricsConfig?.hireDate === null || metricsConfig?.hireDate === undefined
    ? null
    : dayjs().startOf('day').diff(dayjs(metricsConfig.hireDate).startOf('day'), 'day') + 1

  const labels = {
    relaxed: metricsConfig?.labels.relaxed ?? '轻松',
    normal: metricsConfig?.labels.normal ?? '正常',
    busy: metricsConfig?.labels.busy ?? '忙碌',
    crazy: metricsConfig?.labels.crazy ?? '疯狂',
  }
  const cards = [
    {
      key: 'total',
      title: '活跃天数',
      tip: '当前筛选范围内，按上海自然日统计；当天至少有 1 条完整提交即计为 1 天。',
      value: data.length,
      color: '#1677ff',
    },
    {
      key: 'relaxed',
      title: labels.relaxed,
      tip: `当天完整提交数少于 ${thresholds.relaxed} 次。`,
      value: intensity.relaxed,
      percentage: `${((intensity.relaxed / data.length) * 100).toFixed(1)}%`,
      color: '#52c41a',
    },
    {
      key: 'normal',
      title: labels.normal,
      tip: `当天完整提交数不少于 ${thresholds.relaxed} 次且少于 ${thresholds.normal} 次。`,
      value: intensity.normal,
      percentage: `${((intensity.normal / data.length) * 100).toFixed(1)}%`,
      color: '#1677ff',
    },
    {
      key: 'busy',
      title: labels.busy,
      tip: `当天完整提交数不少于 ${thresholds.normal} 次且少于 ${thresholds.busy} 次。`,
      value: intensity.busy,
      percentage: `${((intensity.busy / data.length) * 100).toFixed(1)}%`,
      color: '#fa8c16',
    },
    {
      key: 'crazy',
      title: labels.crazy,
      tip: `当天完整提交数不少于 ${thresholds.busy} 次。`,
      value: intensity.crazy,
      percentage: `${((intensity.crazy / data.length) * 100).toFixed(1)}%`,
      color: '#f5222d',
    },
  ]

  return (
    <Card
      title={(
        <Space size={4}>
          工作强度分布
          <Tooltip title={`强度按当天完整提交数划分，4 个区间互斥；加班按 ${metricsConfig?.overtimeHour ?? 19}:00 后是否有提交单独统计。`}>
            <QuestionCircleOutlined className="text-xs text-gray-400" />
          </Tooltip>
        </Space>
      )}
      extra={
        <Space size={8} wrap>
          <span className="text-xs text-neutral-500">
            入职时间：{metricsConfig?.hireDate ? dayjs(metricsConfig.hireDate).format('YYYY.MM.DD') : '未配置'}
          </span>
          <span className="text-xs text-neutral-500">
            在职天数：{tenureDays === null ? '-' : `${tenureDays} 天`}
          </span>
          <Tooltip title={`加班按 ${metricsConfig?.overtimeHour ?? 19}:00 后是否有提交单独统计。`}>
            <Tag color="red">
              {metricsConfig?.labels.overtime ?? '加班'} {overtimeDays} 天 · {((overtimeDays / data.length) * 100).toFixed(1)}%
            </Tag>
          </Tooltip>
        </Space>
      }
    >
      <Row gutter={[12, 16]}>
        {cards.map((item) => (
          <Col xs={12} sm={8} xl={item.key === 'total' ? 4 : 5} key={item.key}>
            <Statistic
              title={(
                <span className="inline-flex items-center gap-1">
                  {item.title}
                  <Tooltip title={item.tip}>
                    <button
                      type="button"
                      aria-label={`${item.title}指标说明`}
                      className="inline-flex border-0 bg-transparent p-0 text-neutral-400 hover:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                    >
                      <QuestionCircleOutlined className="text-xs" />
                    </button>
                  </Tooltip>
                </span>
              )}
              value={item.value}
              suffix={item.percentage ? (
                <>
                  天 <span className="text-xs font-normal text-neutral-500">({item.percentage})</span>
                </>
              ) : '天'}
              valueStyle={{ color: item.color }}
            />
          </Col>
        ))}
      </Row>
    </Card>
  )
}

export const WorkStatusReport: React.FC<WorkStatusReportProps> = ({ data, dateRange, overtimeMode }) => {
  const [activeTab, setActiveTab] = React.useState('trend')
  const commitsByDate = React.useMemo(() => new Map(
    data.map((group) => [group.date, group.totalCommits]),
  ), [data])
  const chartData = React.useMemo(() => {
    const result: Array<{ date: string; totalCommits: number }> = []
    let cursor = dateRange[0].startOf('day')
    const end = dateRange[1].startOf('day')
    while (!cursor.isAfter(end)) {
      const date = cursor.format('YYYY-MM-DD')
      result.push({ date, totalCommits: commitsByDate.get(date) ?? 0 })
      cursor = cursor.add(1, 'day')
    }
    return result
  }, [commitsByDate, dateRange])
  const chartRenderKey = React.useMemo(() => [
    dateRange[0].format('YYYY-MM-DD'),
    dateRange[1].format('YYYY-MM-DD'),
    overtimeMode,
    chartData.length,
    chartData.reduce((sum, item) => sum + item.totalCommits, 0),
  ].join('|'), [chartData, dateRange, overtimeMode])

  const lineConfig = {
    data: chartData,
    autoFit: true,
    height: 300,
    xField: 'date',
    yField: 'totalCommits',
    point: chartData.length <= 90 ? { size: 4, shape: 'circle' } : false,
    smooth: false,
    color: '#1677ff',
    tooltip: {
      formatter: (datum: { totalCommits: number }) => ({
        name: '提交次数',
        value: `${datum.totalCommits} 次`,
      }),
      title: (datum: { date: string }) => fullDateFormatter.format(toShanghaiDate(datum.date)),
    },
    yAxis: { title: { text: '提交次数' }, min: 0 },
    xAxis: {
      label: {
        autoRotate: false,
        autoHide: true,
        formatter: (value: string) => shortDateFormatter.format(toShanghaiDate(value)),
      },
    },
  }

  const items = [
    {
      key: 'trend',
      label: '趋势图',
      children: (
        <div key={chartRenderKey} className="h-[300px] w-full min-w-0">
          <Line {...lineConfig} key={chartRenderKey} />
        </div>
      ),
    },
    {
      key: 'calendar',
      label: '提交日历',
      children: <CommitCalendar chartData={chartData} dateRange={dateRange} />,
    },
  ]

  return (
    <Card title={getTrendTitle(overtimeMode)} className="[&_.ant-tabs-nav]:!mb-3">
      <Tabs
        activeKey={activeTab}
        destroyInactiveTabPane
        items={items}
        onChange={setActiveTab}
      />
    </Card>
  )
}
