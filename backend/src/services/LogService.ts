import { prisma } from '../db/client.js';

// 类型断言：Prisma Client 已包含这些模型，但 TypeScript 类型可能未及时更新
const prismaClient = prisma as any;

export type ServerLogType = 'start' | 'stop' | 'error';
export type ScheduledTaskStatus = 'success' | 'failed';

export interface CreateServerLogParams {
  type: ServerLogType;
  message: string;
  errorStack?: string;
}

export interface CreateRequestLogParams {
  method: string;
  url: string;
  routeName?: string;
  statusCode: number;
  requestBody?: string;
  responseBody?: string;
  duration: number;
}

export interface CreateScheduledTaskLogParams {
  taskName: string;
  cronExpression?: string;
  startTime: number;
  endTime?: number;
  status: ScheduledTaskStatus;
  repositories: string[];
  totalCommits: number;
  errorMessage?: string;
  taskId?: number; // 关联的任务ID
}

export interface LogsQueryParams {
  startTime?: number;
  endTime?: number;
  page?: number;
  pageSize?: number;
  type?: string;
  status?: string;
  statusCode?: number;
}

export class LogService {
  /**
   * 创建服务器日志
   */
  async createServerLog(params: CreateServerLogParams): Promise<void> {
    const now = BigInt(Date.now());
    await prismaClient.serverLog.create({
      data: {
        type: params.type,
        message: params.message,
        errorStack: params.errorStack,
        timestamp: now,
        createdAt: now
      }
    });
  }

  /**
   * 创建请求日志
   */
  async createRequestLog(params: CreateRequestLogParams): Promise<void> {
    const now = BigInt(Date.now());
    await prismaClient.requestLog.create({
      data: {
        method: params.method,
        url: params.url,
        routeName: params.routeName,
        statusCode: params.statusCode,
        requestBody: params.requestBody,
        responseBody: params.responseBody,
        duration: params.duration,
        timestamp: now,
        createdAt: now
      }
    });
  }

  /**
   * 创建定时任务日志
   */
  async createScheduledTaskLog(params: CreateScheduledTaskLogParams): Promise<void> {
    const now = BigInt(Date.now());
    await prismaClient.scheduledTaskLog.create({
      data: {
        taskName: params.taskName,
        cronExpression: params.cronExpression,
        startTime: BigInt(params.startTime),
        endTime: params.endTime ? BigInt(params.endTime) : null,
        status: params.status,
        repositories: JSON.stringify(params.repositories),
        totalCommits: params.totalCommits,
        errorMessage: params.errorMessage,
        taskId: params.taskId,
        createdAt: now
      }
    });
  }

  /**
   * 查询服务器日志
   */
  async getServerLogs(params: LogsQueryParams = {}) {
    const {
      startTime,
      endTime,
      page = 1,
      pageSize = 20,
      type
    } = params;

    const where: any = {};

    if (startTime || endTime) {
      where.timestamp = {};
      if (startTime) {
        where.timestamp.gte = BigInt(startTime);
      }
      if (endTime) {
        where.timestamp.lte = BigInt(endTime);
      }
    }

    if (type) {
      where.type = type;
    }

    const skip = (page - 1) * pageSize;

    const [logs, total] = await Promise.all([
      prismaClient.serverLog.findMany({
        where,
        orderBy: {
          timestamp: 'desc'
        },
        skip,
        take: pageSize
      }),
      prismaClient.serverLog.count({ where })
    ]);

    return {
      data: logs.map((log: any) => ({
        id: log.id,
        type: log.type,
        message: log.message,
        errorStack: log.errorStack,
        timestamp: Number(log.timestamp),
        createdAt: Number(log.createdAt)
      })),
      total,
      page,
      pageSize
    };
  }

  /**
   * 查询请求日志
   */
  async getRequestLogs(params: LogsQueryParams = {}) {
    const {
      startTime,
      endTime,
      page = 1,
      pageSize = 20,
      statusCode
    } = params;

    const where: any = {};

    if (startTime || endTime) {
      where.timestamp = {};
      if (startTime) {
        where.timestamp.gte = BigInt(startTime);
      }
      if (endTime) {
        where.timestamp.lte = BigInt(endTime);
      }
    }

    if (statusCode) {
      where.statusCode = statusCode;
    }

    const skip = (page - 1) * pageSize;

    const [logs, total] = await Promise.all([
      prismaClient.requestLog.findMany({
        where,
        orderBy: {
          timestamp: 'desc'
        },
        skip,
        take: pageSize
      }),
      prismaClient.requestLog.count({ where })
    ]);

    return {
      data: logs.map((log: any) => ({
        id: log.id,
        method: log.method,
        url: log.url,
        routeName: log.routeName,
        statusCode: log.statusCode,
        requestBody: log.requestBody,
        responseBody: log.responseBody,
        duration: log.duration,
        timestamp: Number(log.timestamp),
        createdAt: Number(log.createdAt)
      })),
      total,
      page,
      pageSize
    };
  }

  /**
   * 查询定时任务日志
   */
  async getScheduledTaskLogs(params: LogsQueryParams = {}) {
    const {
      startTime,
      endTime,
      page = 1,
      pageSize = 20,
      status
    } = params;

    const where: any = {};

    if (startTime || endTime) {
      where.startTime = {};
      if (startTime) {
        where.startTime.gte = BigInt(startTime);
      }
      if (endTime) {
        where.startTime.lte = BigInt(endTime);
      }
    }

    if (status) {
      where.status = status;
    }

    const skip = (page - 1) * pageSize;

    const [logs, total] = await Promise.all([
      prismaClient.scheduledTaskLog.findMany({
        where,
        orderBy: {
          startTime: 'desc'
        },
        skip,
        take: pageSize
      }),
      prismaClient.scheduledTaskLog.count({ where })
    ]);

    return {
      data: logs.map((log: any) => ({
        id: log.id,
        taskName: log.taskName,
        cronExpression: log.cronExpression,
        startTime: Number(log.startTime),
        endTime: log.endTime ? Number(log.endTime) : null,
        status: log.status,
        repositories: JSON.parse(log.repositories) as string[],
        totalCommits: log.totalCommits,
        errorMessage: log.errorMessage,
        createdAt: Number(log.createdAt)
      })),
      total,
      page,
      pageSize
    };
  }

  /**
   * 清理超过指定天数的旧日志
   */
  async cleanOldLogs(days: number = 30): Promise<{ deleted: number }> {
    const cutoffTime = BigInt(Date.now() - days * 24 * 60 * 60 * 1000);

    const [serverLogsDeleted, requestLogsDeleted, taskLogsDeleted] = await Promise.all([
      prismaClient.serverLog.deleteMany({
        where: {
          timestamp: {
            lt: cutoffTime
          }
        }
      }),
      prismaClient.requestLog.deleteMany({
        where: {
          timestamp: {
            lt: cutoffTime
          }
        }
      }),
      prismaClient.scheduledTaskLog.deleteMany({
        where: {
          startTime: {
            lt: cutoffTime
          }
        }
      })
    ]);

    return {
      deleted: serverLogsDeleted.count + requestLogsDeleted.count + taskLogsDeleted.count
    };
  }
}

