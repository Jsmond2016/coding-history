import React from "react"
import { Tabs, Card, DatePicker, Select, Button, Space, message } from "antd"
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons"
import { type Dayjs } from "dayjs"
import { useMemoizedFn } from "ahooks"
import ServerLogsTable from "./components/ServerLogsTable"
import RequestLogsTable from "./components/RequestLogsTable"
import ScheduledTaskLogsTable from "./components/ScheduledTaskLogsTable"
import { logsApi } from "../../services/logsApi"
import type {
  ServerLog,
  RequestLog,
  ScheduledTaskLog,
  LogsQueryParams,
} from "../../types/logs"

const { RangePicker } = DatePicker
const { Option } = Select

// 模块选项
const MODULE_OPTIONS = [
  { label: "repositories", value: "repositories" },
  { label: "commits", value: "commits" },
  { label: "logs", value: "logs" },
  { label: "tasks", value: "tasks" },
  { label: "config", value: "config" },
  { label: "statistics", value: "statistics" },
]

const LogsList: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState("request")
  const [loading, setLoading] = React.useState(false)

  // 服务器日志
  const [serverLogs, setServerLogs] = React.useState<ServerLog[]>([])
  const [serverLogsTotal, setServerLogsTotal] = React.useState(0)
  const [serverLogsPage, setServerLogsPage] = React.useState(1)
  const [serverLogsPageSize, setServerLogsPageSize] = React.useState(20)
  const [serverLogsType, setServerLogsType] = React.useState<
    string | undefined
  >()
  const [serverLogsDateRange, setServerLogsDateRange] = React.useState<
    [Dayjs, Dayjs] | null
  >(null)

  // 请求日志
  const [requestLogs, setRequestLogs] = React.useState<RequestLog[]>([])
  const [requestLogsTotal, setRequestLogsTotal] = React.useState(0)
  const [requestLogsPage, setRequestLogsPage] = React.useState(1)
  const [requestLogsPageSize, setRequestLogsPageSize] = React.useState(20)
  const [requestLogsStatusCode, setRequestLogsStatusCode] = React.useState<
    number | undefined
  >()
  const [requestLogsModule, setRequestLogsModule] = React.useState<
    string | undefined
  >()
  const [requestLogsDateRange, setRequestLogsDateRange] = React.useState<
    [Dayjs, Dayjs] | null
  >(null)

  // 定时任务日志
  const [taskLogs, setTaskLogs] = React.useState<ScheduledTaskLog[]>([])
  const [taskLogsTotal, setTaskLogsTotal] = React.useState(0)
  const [taskLogsPage, setTaskLogsPage] = React.useState(1)
  const [taskLogsPageSize, setTaskLogsPageSize] = React.useState(20)
  const [taskLogsStatus, setTaskLogsStatus] = React.useState<
    string | undefined
  >()
  const [taskLogsDateRange, setTaskLogsDateRange] = React.useState<
    [Dayjs, Dayjs] | null
  >(null)

  // 加载服务器日志
  const loadServerLogs = useMemoizedFn(async (page = 1, pageSize = 20) => {
    setLoading(true)
    try {
      const params: LogsQueryParams = {
        page,
        pageSize,
      }

      if (
        serverLogsDateRange &&
        serverLogsDateRange[0] &&
        serverLogsDateRange[1]
      ) {
        params.startTime = serverLogsDateRange[0].startOf("day").valueOf()
        params.endTime = serverLogsDateRange[1].endOf("day").valueOf()
      }

      if (serverLogsType) {
        params.type = serverLogsType as any
      }

      const result = await logsApi.getServerLogs(params)
      setServerLogs(result.data)
      setServerLogsTotal(result.total)
      setServerLogsPage(result.page)
      setServerLogsPageSize(result.pageSize)
    } catch (error) {
      message.error("加载服务器日志失败")
      console.error(error)
    } finally {
      setLoading(false)
    }
  })

  // 加载请求日志
  const loadRequestLogs = useMemoizedFn(async (page = 1, pageSize = 20) => {
    setLoading(true)
    try {
      const params: LogsQueryParams = {
        page,
        pageSize,
      }

      if (
        requestLogsDateRange &&
        requestLogsDateRange[0] &&
        requestLogsDateRange[1]
      ) {
        params.startTime = requestLogsDateRange[0].startOf("day").valueOf()
        params.endTime = requestLogsDateRange[1].endOf("day").valueOf()
      }

      if (requestLogsStatusCode) {
        params.statusCode = requestLogsStatusCode
      }

      if (requestLogsModule) {
        params.module = requestLogsModule
      }

      const result = await logsApi.getRequestLogs(params)
      setRequestLogs(result.data)
      setRequestLogsTotal(result.total)
      setRequestLogsPage(result.page)
      setRequestLogsPageSize(result.pageSize)
    } catch (error) {
      message.error("加载请求日志失败")
      console.error(error)
    } finally {
      setLoading(false)
    }
  })

  // 加载定时任务日志
  const loadTaskLogs = useMemoizedFn(async (page = 1, pageSize = 20) => {
    setLoading(true)
    try {
      const params: LogsQueryParams = {
        page,
        pageSize,
      }

      if (taskLogsDateRange && taskLogsDateRange[0] && taskLogsDateRange[1]) {
        params.startTime = taskLogsDateRange[0].startOf("day").valueOf()
        params.endTime = taskLogsDateRange[1].endOf("day").valueOf()
      }

      if (taskLogsStatus) {
        params.status = taskLogsStatus as any
      }

      const result = await logsApi.getScheduledTaskLogs(params)
      setTaskLogs(result.data)
      setTaskLogsTotal(result.total)
      setTaskLogsPage(result.page)
      setTaskLogsPageSize(result.pageSize)
    } catch (error) {
      message.error("加载定时任务日志失败")
      console.error(error)
    } finally {
      setLoading(false)
    }
  })

  // Tab 切换时加载对应数据
  React.useEffect(() => {
    if (activeTab === "server") {
      loadServerLogs()
    } else if (activeTab === "request") {
      loadRequestLogs()
    } else if (activeTab === "task") {
      loadTaskLogs()
    }
  }, [activeTab, loadServerLogs, loadRequestLogs, loadTaskLogs])

  const handleServerLogsSearch = useMemoizedFn(() => {
    loadServerLogs(1, serverLogsPageSize)
  })

  const handleRequestLogsSearch = useMemoizedFn(() => {
    loadRequestLogs(1, requestLogsPageSize)
  })

  const handleTaskLogsSearch = useMemoizedFn(() => {
    loadTaskLogs(1, taskLogsPageSize)
  })

  const tabItems = [
    {
      key: "request",
      label: "请求访问情况",
      children: (
        <div>
          <Card className="mb-4">
            <Space>
              <RangePicker
                value={requestLogsDateRange}
                onChange={(dates) =>
                  setRequestLogsDateRange(dates as [Dayjs, Dayjs] | null)
                }
                format="YYYY-MM-DD"
              />
              <Select
                placeholder="选择模块"
                style={{ width: 150 }}
                allowClear
                value={requestLogsModule}
                onChange={setRequestLogsModule}
              >
                {MODULE_OPTIONS.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Select>
              <Select
                placeholder="选择状态码"
                style={{ width: 150 }}
                allowClear
                value={requestLogsStatusCode}
                onChange={setRequestLogsStatusCode}
              >
                <Option value={200}>200 OK</Option>
                <Option value={400}>400 Bad Request</Option>
                <Option value={401}>401 Unauthorized</Option>
                <Option value={404}>404 Not Found</Option>
                <Option value={500}>500 Server Error</Option>
              </Select>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleRequestLogsSearch}
              >
                查询
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() =>
                  loadRequestLogs(requestLogsPage, requestLogsPageSize)
                }
              >
                刷新
              </Button>
            </Space>
          </Card>
          <RequestLogsTable
            data={requestLogs}
            loading={loading}
            pagination={{
              current: requestLogsPage,
              pageSize: requestLogsPageSize,
              total: requestLogsTotal,
              onChange: (page, pageSize) => {
                setRequestLogsPage(page)
                setRequestLogsPageSize(pageSize)
                loadRequestLogs(page, pageSize)
              },
            }}
          />
        </div>
      ),
    },
    {
      key: "server",
      label: "服务器运行情况",
      children: (
        <div>
          <Card className="mb-4">
            <Space>
              <RangePicker
                value={serverLogsDateRange}
                onChange={(dates) =>
                  setServerLogsDateRange(dates as [Dayjs, Dayjs] | null)
                }
                format="YYYY-MM-DD"
              />
              <Select
                placeholder="选择类型"
                style={{ width: 150 }}
                allowClear
                value={serverLogsType}
                onChange={setServerLogsType}
              >
                <Option value="start">启动</Option>
                <Option value="stop">关闭</Option>
                <Option value="error">异常</Option>
              </Select>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleServerLogsSearch}
              >
                查询
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() =>
                  loadServerLogs(serverLogsPage, serverLogsPageSize)
                }
              >
                刷新
              </Button>
            </Space>
          </Card>
          <ServerLogsTable
            data={serverLogs}
            loading={loading}
            pagination={{
              current: serverLogsPage,
              pageSize: serverLogsPageSize,
              total: serverLogsTotal,
              onChange: (page, pageSize) => {
                setServerLogsPage(page)
                setServerLogsPageSize(pageSize)
                loadServerLogs(page, pageSize)
              },
            }}
          />
        </div>
      ),
    },

    {
      key: "task",
      label: "定时任务执行情况",
      children: (
        <div>
          <Card className="mb-4">
            <Space>
              <RangePicker
                value={taskLogsDateRange}
                onChange={(dates) =>
                  setTaskLogsDateRange(dates as [Dayjs, Dayjs] | null)
                }
                format="YYYY-MM-DD"
              />
              <Select
                placeholder="选择状态"
                style={{ width: 150 }}
                allowClear
                value={taskLogsStatus}
                onChange={setTaskLogsStatus}
              >
                <Option value="success">成功</Option>
                <Option value="failed">失败</Option>
              </Select>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleTaskLogsSearch}
              >
                查询
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => loadTaskLogs(taskLogsPage, taskLogsPageSize)}
              >
                刷新
              </Button>
            </Space>
          </Card>
          <ScheduledTaskLogsTable
            data={taskLogs}
            loading={loading}
            pagination={{
              current: taskLogsPage,
              pageSize: taskLogsPageSize,
              total: taskLogsTotal,
              onChange: (page, pageSize) => {
                setTaskLogsPage(page)
                setTaskLogsPageSize(pageSize)
                loadTaskLogs(page, pageSize)
              },
            }}
          />
        </div>
      ),
    },
  ]

  return (
    <div>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
    </div>
  )
}

export default LogsList
