#!/usr/bin/env bash

# 管理 Coding History 自己启动的 Redis 实例。
# redis-cli 是客户端，真正的服务进程由 redis-server 提供。
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="${ROOT}/backend/.runtime"
PID_FILE="${RUNTIME_DIR}/redis.pid"
LOG_FILE="${ROOT}/backend/logs/redis.log"
ENV_FILE="${ROOT}/backend/.env"

REDIS_AUTOSTART_FROM_ENV="${REDIS_AUTOSTART+x}"
REDIS_AUTOSTART="${REDIS_AUTOSTART:-true}"
REDIS_HOST="127.0.0.1"
REDIS_PORT="6379"
REDIS_URL="redis://127.0.0.1:6379"

read_env_value() {
  local key="$1"
  if [[ ! -f "${ENV_FILE}" ]]; then
    return 0
  fi

  local value
  value="$(awk -F= -v key="${key}" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "${ENV_FILE}")"
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  printf '%s' "${value}"
}

load_config() {
  local configured_url
  local configured_autostart
  configured_autostart="$(read_env_value REDIS_AUTOSTART)"
  configured_url="$(read_env_value REDIS_URL)"

  if [[ -z "${REDIS_AUTOSTART_FROM_ENV}" && -n "${configured_autostart}" ]]; then
    REDIS_AUTOSTART="${configured_autostart}"
  fi

  if [[ -n "${configured_url}" ]]; then
    # 项目默认使用 redis://host:port；复杂认证参数仍由后端 REDIS_URL 负责。
    local parsed_host parsed_port
    REDIS_URL="${configured_url}"
    parsed_host="$(printf '%s' "${configured_url}" | sed -E 's#^[a-zA-Z]+://([^@/]+@)?([^:/]+).*#\2#')"
    parsed_port="$(printf '%s' "${configured_url}" | sed -nE 's#^[a-zA-Z]+://([^@/]+@)?[^:/]+:([0-9]+).*#\2#p')"
    [[ -n "${parsed_host}" ]] && REDIS_HOST="${parsed_host}"
    [[ -n "${parsed_port}" ]] && REDIS_PORT="${parsed_port}"
  fi
}

warn() {
  printf '[Redis] WARNING: %s\n' "$*" >&2
}

is_reachable() {
  command -v redis-cli >/dev/null 2>&1 \
    && redis-cli -u "${REDIS_URL}" ping 2>/dev/null | grep -qx 'PONG'
}

is_owned_process() {
  [[ -f "${PID_FILE}" ]] || return 1
  local pid command_line
  pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  [[ "${pid}" =~ ^[0-9]+$ ]] || return 1
  kill -0 "${pid}" 2>/dev/null || return 1
  command_line="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
  [[ "${command_line}" == *redis-server* ]]
}

start_redis() {
  load_config

  local autostart_normalized
  autostart_normalized="$(printf '%s' "${REDIS_AUTOSTART}" | tr '[:upper:]' '[:lower:]')"
  if [[ "${autostart_normalized}" != "true" ]]; then
    printf '[Redis] REDIS_AUTOSTART=%s，跳过自动启动；后端将使用 Node 内存缓存或已有 Redis。\n' "${REDIS_AUTOSTART}"
    return 0
  fi

  if ! command -v redis-cli >/dev/null 2>&1; then
    warn "未找到 redis-cli，无法检查 Redis；请安装 redis-cli，后端将降级使用 Node 内存缓存。"
    return 0
  fi

  if is_reachable; then
    printf '[Redis] 已有 Redis 在 %s:%s 运行，复用现有实例。\n' "${REDIS_HOST}" "${REDIS_PORT}"
    return 0
  fi

  case "${REDIS_HOST}" in
    127.0.0.1|localhost|::1) ;;
    *)
      warn "REDIS_URL 指向远程主机 ${REDIS_HOST}，不会尝试在本机启动 redis-server；后端将使用 Node 内存缓存。"
      return 0
      ;;
  esac

  if ! command -v redis-server >/dev/null 2>&1; then
    warn "未找到 redis-server；请安装 Redis 服务端，后端将降级使用 Node 内存缓存。"
    return 0
  fi

  mkdir -p "${RUNTIME_DIR}" "$(dirname "${LOG_FILE}")"
  if is_owned_process; then
    warn "记录的 Redis 进程仍在运行但暂时无法通过 redis-cli 连接：${PID_FILE}"
    return 0
  fi
  rm -f "${PID_FILE}"

  if ! redis-server \
    --daemonize yes \
    --bind "${REDIS_HOST}" \
    --port "${REDIS_PORT}" \
    --pidfile "${PID_FILE}" \
    --logfile "${LOG_FILE}"; then
    warn "redis-server 启动失败，后端将降级使用 Node 内存缓存。详见 ${LOG_FILE}"
    return 0
  fi

  local attempt
  for attempt in {1..10}; do
    if is_reachable; then
      printf '[Redis] 已启动 %s:%s（PID 文件：%s）。\n' "${REDIS_HOST}" "${REDIS_PORT}" "${PID_FILE}"
      return 0
    fi
    sleep 0.2
  done

  warn "Redis 已尝试启动但健康检查失败，后端将降级使用 Node 内存缓存。详见 ${LOG_FILE}"
  return 0
}

stop_redis() {
  load_config

  if ! is_owned_process; then
    rm -f "${PID_FILE}"
    printf '[Redis] 没有需要由项目关闭的 Redis 实例，保留用户已有服务。\n'
    return 0
  fi

  local pid
  pid="$(cat "${PID_FILE}")"
  if kill "${pid}" 2>/dev/null; then
    for _ in {1..20}; do
      kill -0 "${pid}" 2>/dev/null || break
      sleep 0.1
    done
  fi
  rm -f "${PID_FILE}"
  printf '[Redis] 已关闭项目启动的 Redis（PID %s）。\n' "${pid}"
  return 0
}

case "${1:-}" in
  start)
    start_redis
    ;;
  stop)
    stop_redis
    ;;
  *)
    printf '用法: %s {start|stop}\n' "$0" >&2
    exit 2
    ;;
esac
