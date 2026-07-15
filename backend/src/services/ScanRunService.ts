import { prisma } from '../db/client.js';
import { ConfigService } from './ConfigService.js';
import { ScanTaskService, type ScanTask } from './ScanTaskService.js';
import { executeScanTask } from './ScanTaskExecutor.js';
import { logger } from '../config/logger.js';

const prismaClient = prisma as any;
const lockedRepositoryIds = new Set<string>();

export type ScanRunStatus = 'queued' | 'running' | 'success' | 'partial' | 'failed';

export interface CreateManualScanRunParams {
  startDate: number;
  endDate: number;
  repositoryIds?: string[];
}

export class ScanRunService {
  private configService = new ConfigService();
  private taskService = new ScanTaskService();

  async createManualRun(params: CreateManualScanRunParams) {
    const repositoryIds = await this.resolveRepositoryIds(params.repositoryIds);
    return this.createRun({
      planId: undefined,
      triggerSource: 'manual',
      repositoryIds,
      rangeStart: params.startDate,
      rangeEnd: params.endDate
    });
  }

  async createPlanRun(plan: ScanTask, triggerSource: 'manual' | 'scheduled') {
    if (!plan.repositoryIds?.length) {
      throw new Error('扫描计划没有可执行的数据源');
    }
    const repositoryIds = await this.resolveRepositoryIds(plan.repositoryIds);
    const { calculateScanDateRange } = await import('./ScanTaskExecutor.js');
    const range = calculateScanDateRange(plan.scanRangeType, plan.startDate, plan.endDate);
    return this.createRun({
      planId: plan.id,
      triggerSource,
      repositoryIds,
      rangeStart: range.fromDate.getTime(),
      rangeEnd: range.toDate.getTime()
    });
  }

  async getRun(id: number) {
    const run = await prismaClient.scanRun.findUnique({
      where: { id },
      include: { results: { orderBy: { id: 'asc' } } }
    });
    return run ? this.mapRun(run) : null;
  }

  async listRuns(params?: { planId?: number; limit?: number }) {
    const runs = await prismaClient.scanRun.findMany({
      where: params?.planId ? { planId: params.planId } : undefined,
      include: { results: { orderBy: { id: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(params?.limit ?? 30, 1), 100)
    });
    return runs.map((run: any) => this.mapRun(run));
  }

  private async resolveRepositoryIds(requested?: string[]): Promise<string[]> {
    const enabledRepositories = await this.configService.getEnabledRepositories();
    const enabledIds = new Set(enabledRepositories.map((repository) => repository.id));
    let repositoryIds = requested?.length ? requested.filter((id) => enabledIds.has(id)) : [];

    if (repositoryIds.length === 0 && !requested?.length) {
      const defaultPlan = await this.taskService.getPrimaryTask();
      repositoryIds = defaultPlan?.repositoryIds?.filter((id) => enabledIds.has(id)) ?? [];
    }
    if (repositoryIds.length === 0 && !requested?.length) {
      repositoryIds = enabledRepositories.map((repository) => repository.id);
    }
    if (repositoryIds.length === 0) {
      throw new Error('没有可扫描的数据源，请检查仓库是否已启用');
    }

    const missingAuthors: string[] = [];
    for (const repositoryId of repositoryIds) {
      const authors = await this.configService.getAuthorEmailsByRepoId(repositoryId);
      if (authors.length === 0) missingAuthors.push(repositoryId);
    }
    if (missingAuthors.length > 0) {
      throw new Error(`以下数据源尚未配置作者：${missingAuthors.join('、')}`);
    }
    return Array.from(new Set(repositoryIds));
  }

  private async createRun(params: {
    planId?: number;
    triggerSource: 'manual' | 'scheduled';
    repositoryIds: string[];
    rangeStart: number;
    rangeEnd: number;
  }) {
    const conflicts = params.repositoryIds.filter((id) => lockedRepositoryIds.has(id));
    if (conflicts.length > 0) {
      throw new Error(`以下仓库正在扫描，请等待完成后重试：${conflicts.join('、')}`);
    }

    params.repositoryIds.forEach((id) => lockedRepositoryIds.add(id));
    const now = Date.now();
    let run;
    try {
      run = await prismaClient.scanRun.create({
        data: {
          planId: params.planId ?? null,
          triggerSource: params.triggerSource,
          status: 'queued',
          requestedRepoIds: JSON.stringify(params.repositoryIds),
          rangeStart: BigInt(params.rangeStart),
          rangeEnd: BigInt(params.rangeEnd),
          createdAt: BigInt(now)
        }
      });
    } catch (error) {
      params.repositoryIds.forEach((id) => lockedRepositoryIds.delete(id));
      throw error;
    }

    void this.executeRun(run.id, params).catch((error) => {
      logger.error({ msg: '[扫描执行] 后台执行失败', runId: run.id, error });
    });
    return this.mapRun({ ...run, results: [] });
  }

  private async executeRun(runId: number, params: {
    planId?: number;
    triggerSource: 'manual' | 'scheduled';
    repositoryIds: string[];
    rangeStart: number;
    rangeEnd: number;
  }): Promise<void> {
    const startedAt = Date.now();
    try {
      await prismaClient.scanRun.update({
        where: { id: runId },
        data: { status: 'running', startedAt: BigInt(startedAt) }
      });

      const task: ScanTask = {
        id: params.planId ?? 0,
        name: params.triggerSource === 'manual' ? '手动同步' : `扫描计划 #${params.planId}`,
        taskType: params.triggerSource === 'manual' ? 'manual' : 'scheduled',
        scanRangeType: 'custom',
        startDate: params.rangeStart,
        endDate: params.rangeEnd,
        repositoryIds: params.repositoryIds,
        isPrimary: false,
        enabled: true,
        sortOrder: 0,
        createdAt: startedAt,
        updatedAt: startedAt
      };
      const result = await executeScanTask(task, { taskId: params.planId });

      if (result.repositoryResults.length > 0) {
        await prismaClient.scanRunRepository.createMany({
          data: result.repositoryResults.map((repository) => ({
            runId,
            repoId: repository.repoId,
            repoName: repository.repoName,
            status: repository.status,
            insertedCommits: repository.insertedCommits,
            skippedCommits: repository.skippedCommits,
            errorMessage: repository.errorMessage ?? null,
            startedAt: BigInt(repository.startedAt),
            finishedAt: BigInt(repository.finishedAt)
          }))
        });
      }

      const successCount = result.repositoryResults.filter((item) => item.status === 'success').length;
      const problemCount = result.repositoryResults.length - successCount;
      const status: ScanRunStatus = problemCount === 0
        ? 'success'
        : successCount > 0
          ? 'partial'
          : 'failed';
      await prismaClient.scanRun.update({
        where: { id: runId },
        data: {
          status,
          finishedAt: BigInt(Date.now()),
          insertedCommits: result.totalCommits,
          skippedCommits: result.skippedCommits,
          errorMessage: result.errorMessage ?? null
        }
      });
      if (params.planId) {
        await this.taskService.updateLastExecuteTime(params.planId, startedAt);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await prismaClient.scanRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          finishedAt: BigInt(Date.now()),
          errorMessage
        }
      }).catch(() => {});
      throw error;
    } finally {
      params.repositoryIds.forEach((id) => lockedRepositoryIds.delete(id));
    }
  }

  private mapRun(run: any) {
    return {
      id: run.id,
      planId: run.planId ?? undefined,
      triggerSource: run.triggerSource,
      status: run.status,
      requestedRepositoryIds: JSON.parse(run.requestedRepoIds),
      rangeStart: Number(run.rangeStart),
      rangeEnd: Number(run.rangeEnd),
      startedAt: run.startedAt ? Number(run.startedAt) : undefined,
      finishedAt: run.finishedAt ? Number(run.finishedAt) : undefined,
      insertedCommits: run.insertedCommits,
      skippedCommits: run.skippedCommits,
      errorMessage: run.errorMessage ?? undefined,
      createdAt: Number(run.createdAt),
      results: (run.results ?? []).map((result: any) => ({
        id: result.id,
        repoId: result.repoId,
        repoName: result.repoName,
        status: result.status,
        insertedCommits: result.insertedCommits,
        skippedCommits: result.skippedCommits,
        errorMessage: result.errorMessage ?? undefined,
        startedAt: result.startedAt ? Number(result.startedAt) : undefined,
        finishedAt: result.finishedAt ? Number(result.finishedAt) : undefined
      }))
    };
  }
}
