import React from "react"
import { Pie } from "@ant-design/charts"
import { Card, Empty, Tag } from "antd"
import { useLatest } from "ahooks"

export interface OverviewPieDatum {
  key: string
  name: string
  value: number
  color: string
}

interface OverviewPieChartProps {
  title: string
  data: OverviewPieDatum[]
  unit: string
  selectedKey?: string
  onSelect?: (datum: OverviewPieDatum) => void
  extraContent?: React.ReactNode
}

export const OverviewPieChart: React.FC<OverviewPieChartProps> = ({
  title,
  data,
  unit,
  selectedKey,
  onSelect,
  extraContent,
}) => {
  const visibleData = data.filter((item) => item.value > 0)
  const total = visibleData.reduce((sum, item) => sum + item.value, 0)
  const onSelectRef = useLatest(onSelect)

  return (
    <Card
      title={title}
      extra={extraContent ?? <Tag>{total.toLocaleString()} {unit}</Tag>}
      className="h-full border-0 shadow-sm"
    >
      {total > 0 ? (
        <>
          <div
            className={`h-[220px] w-full min-w-0 ${onSelect ? "[&_canvas]:cursor-pointer" : ""}`}
            aria-label={onSelect ? `${title}，点击扇区可筛选提交历史` : title}
          >
            <Pie
              data={visibleData}
              angleField="value"
              colorField="name"
              color={visibleData.map((item) => item.color)}
              radius={0.9}
              legend={false}
              label={false}
              tooltip={{
                title: (datum: OverviewPieDatum) => datum.name,
                items: [
                  (datum: OverviewPieDatum) => ({
                    name: unit,
                    color: datum.color,
                    value: `${datum.value.toLocaleString()} · ${((datum.value / total) * 100).toFixed(1)}%`,
                  }),
                ],
              }}
              onEvent={(_, event) => {
                if (event.type !== "element:click") return
                const datum = event.data?.data as OverviewPieDatum | undefined
                if (datum) onSelectRef.current?.(datum)
              }}
            />
          </div>
          <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2" aria-label={`${title}图例`}>
            {visibleData.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`flex min-w-0 items-center gap-2 border-0 bg-transparent p-0 text-left text-xs ${onSelect ? "cursor-pointer hover:text-blue-600" : "cursor-default"} ${selectedKey === item.key ? "font-medium text-blue-600" : ""}`}
                onClick={() => onSelect?.(item)}
                disabled={!onSelect}
                aria-label={`筛选${item.name}提交历史`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span className="min-w-0 flex-1 truncate text-neutral-700" title={item.name}>
                  {item.name}
                </span>
                <span className="shrink-0 tabular-nums text-neutral-500">
                  {item.value.toLocaleString()} · {((item.value / total) * 100).toFixed(1)}%
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <Empty description="当前范围暂无数据" />
      )}
    </Card>
  )
}
