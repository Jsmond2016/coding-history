// HTTP 状态码常量
export const HTTP_STATUS_CODES = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
} as const

// HTTP 状态码选项（用于下拉选择）
export const STATUS_CODE_OPTIONS = [
  { label: "200 OK", value: HTTP_STATUS_CODES.OK },
  { label: "400 Bad Request", value: HTTP_STATUS_CODES.BAD_REQUEST },
  { label: "401 Unauthorized", value: HTTP_STATUS_CODES.UNAUTHORIZED },
  { label: "404 Not Found", value: HTTP_STATUS_CODES.NOT_FOUND },
  { label: "500 Server Error", value: HTTP_STATUS_CODES.SERVER_ERROR },
] as const

// 日志类型常量
export const LOG_TYPES = {
  START: "start",
  STOP: "stop",
  ERROR: "error",
} as const

// 日志类型选项（用于下拉选择）
export const LOG_TYPE_OPTIONS = [
  { label: "启动", value: LOG_TYPES.START },
  { label: "关闭", value: LOG_TYPES.STOP },
  { label: "异常", value: LOG_TYPES.ERROR },
] as const

// 任务状态常量
export const TASK_STATUS = {
  SUCCESS: "success",
  FAILED: "failed",
} as const

// 任务状态选项（用于下拉选择）
export const TASK_STATUS_OPTIONS = [
  { label: "成功", value: TASK_STATUS.SUCCESS },
  { label: "失败", value: TASK_STATUS.FAILED },
] as const

// 模块选项
export const MODULE_OPTIONS = [
  { label: "repositories", value: "repositories" },
  { label: "commits", value: "commits" },
  { label: "logs", value: "logs" },
  { label: "tasks", value: "tasks" },
  { label: "config", value: "config" },
  { label: "statistics", value: "statistics" },
] as const

// 分页配置
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
}

// 时间范围预设（天）
export const DATE_RANGE_PRESETS = {
  ONE_WEEK: 7,
  ONE_MONTH: 1, // 月
  THREE_MONTHS: 3, // 月
  SIX_MONTHS: 6, // 月
  ONE_YEAR: 1, // 年
  MAX_YEARS: 2, // 最大时间范围（年）
} as const

// 时间范围标签
export const DATE_RANGE_LABELS = {
  ONE_WEEK: "最近一周",
  ONE_MONTH: "最近一个月",
  THREE_MONTHS: "最近三个月",
  SIX_MONTHS: "最近半年",
  ONE_YEAR: "最近一年",
} as const

// 加班状态
export const OVERTIME_STATUS = {
  OVERTIME_ONLY: true,
  NON_OVERTIME: false,
} as const
