import React from 'react';
import { message } from 'antd';
import { gitStatisticsApi } from '../../services/gitStatisticsApi';
import { useScanContext } from '../contexts/ScanContext';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_COUNT = 150;

async function pollUntilScanFinishes(): Promise<{ timedOut: boolean; error?: string }> {
  for (let i = 0; i < MAX_POLL_COUNT; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const status = await gitStatisticsApi.getScanStatus();
    if (status.finished === 2) {
      return { timedOut: false, error: status.error };
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
      runTrigger: () => Promise<{ finished: 0 | 1 | 2 }>,
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
        const result = await runTrigger();

        if (result.finished === 1) {
          message.info(messages.started);
          const { timedOut, error } = await pollUntilScanFinishes();
          setScanning(false);

          if (timedOut) {
            message.warning(
              '扫描等待超时。若数据仍未更新，请约 1 分钟后再试，或重启后端服务'
            );
            return false;
          }
          if (error) {
            message.error(`扫描失败: ${error}`);
            return false;
          }
          message.success(messages.success);
          onScanComplete?.();
          return true;
        }

        if (result.finished === 2) {
          setScanning(false);
          message.success(messages.success);
          onScanComplete?.();
          return true;
        }

        setScanning(false);
        message.warning('扫描状态异常');
        return false;
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
        () => gitStatisticsApi.triggerScan(params),
        {
          started: '扫描已开始，将按当前筛选的日期范围从 Git 拉取并入库…',
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
