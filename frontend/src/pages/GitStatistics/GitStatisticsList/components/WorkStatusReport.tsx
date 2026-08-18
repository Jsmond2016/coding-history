import React from 'react'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { Card, Col, Row, Space, Statistic, Tag, Tooltip } from 'antd'
import { Line } from '@ant-design/charts'
import type { Dayjs } from 'dayjs'
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

  const cards = [
    { key: 'total', title: '活跃天数', value: data.length, color: '#1677ff' },
    { key: 'relaxed', title: metricsConfig?.labels.relaxed ?? '轻松', value: intensity.relaxed, color: '#52c41a' },
    { key: 'normal', title: metricsConfig?.labels.normal ?? '正常', value: intensity.normal, color: '#1677ff' },
    { key: 'busy', title: metricsConfig?.labels.busy ?? '忙碌', value: intensity.busy, color: '#fa8c16' },
    { key: 'crazy', title: metricsConfig?.labels.crazy ?? '疯狂', value: intensity.crazy, color: '#f5222d' },
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
        <Tag color="red">
          {metricsConfig?.labels.overtime ?? '加班'} {overtimeDays} 天 · {((overtimeDays / data.length) * 100).toFixed(1)}%
        </Tag>
      }
    >
      <Row gutter={[12, 16]}>
        {cards.map((item) => (
          <Col xs={12} sm={8} xl={item.key === 'total' ? 4 : 5} key={item.key}>
            <Statistic
              title={item.title}
              value={item.value}
              suffix="天"
              valueStyle={{ color: item.color }}
            />
          </Col>
        ))}
      </Row>
    </Card>
  )
}

export const WorkStatusReport: React.FC<WorkStatusReportProps> = ({ data, dateRange, overtimeMode }) => {
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

  const lineConfig = {
    data: chartData,
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

  return (
    <Card title={getTrendTitle(overtimeMode)}>
      <div className="h-[300px]">
        <Line {...lineConfig} />
      </div>
    </Card>
  )
}
