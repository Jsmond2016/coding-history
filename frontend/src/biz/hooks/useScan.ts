import React from 'react';
import { message } from 'antd';
import { gitStatisticsApi } from '../../services/gitStatisticsApi';
import { useScanContext } from '../contexts/ScanContext';

export const useScan = () => {
  const { onScanComplete } = useScanContext();
  const [scanning, setScanning] = React.useState(false);
  const [lastScanTime, setLastScanTime] = React.useState<number>(0);

  const handleScan = React.useCallback(async () => {
    // 防抖：30秒内只能扫描一次
    const now = Date.now();
    if (now - lastScanTime < 30000) {
      const remainingSeconds = Math.ceil((30000 - (now - lastScanTime)) / 1000);
      message.warning(`请等待 ${remainingSeconds} 秒后再次扫描`);
      return;
    }

    setScanning(true);
    setLastScanTime(now);
    
    try {
      // 触发扫描（异步）
      const result = await gitStatisticsApi.triggerScan();
      
      if (result.finished === 1) {
        // 扫描中，开始轮询检查状态
        message.info('扫描已开始，正在同步最近2周的提交数据...');
        
        let pollCount = 0;
        const maxPollCount = 150; // 最多轮询150次（5分钟）
        
        const pollInterval = setInterval(async () => {
          pollCount++;
          
          try {
            const status = await gitStatisticsApi.getScanStatus();
            
            if (status.finished === 2) {
              // 扫描完成
              clearInterval(pollInterval);
              setScanning(false);
              
              if (status.error) {
                message.error(`扫描失败: ${status.error}`);
              } else {
                message.success('已更新最近2周的提交数据');
                // 触发刷新回调
                onScanComplete?.();
              }
            } else if (pollCount >= maxPollCount) {
              // 超时
              clearInterval(pollInterval);
              setScanning(false);
              message.warning('扫描超时，请稍后手动刷新数据');
            }
          } catch (error) {
            clearInterval(pollInterval);
            setScanning(false);
            message.error('查询扫描状态失败');
          }
        }, 2000); // 每2秒轮询一次
      } else if (result.finished === 2) {
        // 已完成（可能是之前已经完成）
        setScanning(false);
        message.success('已更新最近2周的提交数据');
        onScanComplete?.();
      } else {
        // 未开始（不应该发生）
        setScanning(false);
        message.warning('扫描状态异常');
      }
    } catch (error) {
      setScanning(false);
      message.error('扫描失败');
    }
  }, [lastScanTime, onScanComplete]);

  return {
    scanning,
    handleScan
  };
};
