import React from 'react';
import { message } from 'antd';
import { scanRunsApi } from '../../services/scanRunsApi';
import type { ScanRun } from '../../types/tasks';
import { useScanContext } from '../contexts/ScanContext';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_COUNT = 150;

async function pollUntilScanFinishes(runId: number): Promise<{ timedOut: boolean; run?: ScanRun }> {
  for (let i = 0; i < MAX_POLL_COUNT; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const run = await scanRunsApi.get(runId);
    if (['success', 'partial', 'failed'].includes(run.status)) {
      return { timedOut: false, run };
    }
  }
  return { timedOut: true };
}

/** 与统计页筛选一致：日期区间 + 可选仓库（空数组表示不限定，扫全部已启用仓库） */
export interface ManualScanParams {
  startDate: number;
  endDate: number;
  repositoryIds?: string[];
}

export const useScan = () => {
  const { onScanComplete } = useScanContext();
  const [scanning, setScanning] = React.useState(false);
  const [lastScanTime, setLastScanTime] = React.useState<number>(0);

  const runDebouncedScan = React.useCallback(
    async (
      runTrigger: () => Promise<ScanRun>,
      messages: { started: string; success: string }
    ): Promise<boolean> => {
      const now = Date.now();
      if (now - lastScanTime < 30000) {
        const remainingSeconds = Math.ceil((30000 - (now - lastScanTime)) / 1000);
        message.warning(`请等待 ${remainingSeconds} 秒后再试`);
        return false;
      }

      setScanning(true);
      setLastScanTime(now);

      try {
        const createdRun = await runTrigger();
        message.info(messages.started);
        const { timedOut, run } = await pollUntilScanFinishes(createdRun.id);
        setScanning(false);

        if (timedOut || !run) {
          message.warning('同步仍在后台执行，可前往“扫描计划”查看执行进度');
          return false;
        }
        if (run.status === 'failed') {
          message.error(`同步失败: ${run.errorMessage || '请查看执行详情'}`);
          return false;
        }
        if (run.status === 'partial') {
          message.warning(`同步部分完成，新增 ${run.insertedCommits} 条提交，请查看执行详情`);
        } else {
          message.success(`${messages.success}，新增 ${run.insertedCommits} 条提交`);
        }
        onScanComplete?.();
        return true;
      } catch {
        setScanning(false);
        message.error('请求失败');
        return false;
      }
    },
    [lastScanTime, onScanComplete]
  );

  const handleScan = React.useCallback(
    async (params: ManualScanParams): Promise<boolean> => {
      return runDebouncedScan(
        () => scanRunsApi.create(params),
        {
          started: '同步已开始，将按确认的仓库和日期范围从 Git 拉取并入库…',
          success: '扫描完成（区间内已存在的提交会自动去重跳过）'
        }
      );
    },
    [runDebouncedScan]
  );

  return {
    scanning,
    handleScan
  };
};
