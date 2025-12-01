import React from 'react';
import { Space, DatePicker, Select, Button, message, ConfigProvider } from 'antd';
import { SearchOutlined, ReloadOutlined, UndoOutlined } from '@ant-design/icons';
import { useAtom } from 'jotai';
import dayjs, { type Dayjs } from 'dayjs';
import { filterAtom, repositoriesAtom } from '../../../../biz/atoms/gitStatistics.atom';
import { gitStatisticsApi } from '../../../../services/gitStatisticsApi';
import type { Repository } from '../../../../types/gitStatistics';

const { RangePicker } = DatePicker;
const { Option } = Select;

interface StatisticsFilterProps {
  onSearch: (customFilter?: { dateRange: [Dayjs, Dayjs]; repositoryIds: string[]; isOvertime?: boolean }) => void;
}

export const StatisticsFilter: React.FC<StatisticsFilterProps> = ({ onSearch }) => {
  const [filter, setFilter] = useAtom(filterAtom);
  const [repositories] = useAtom(repositoriesAtom);
  const [scanning, setScanning] = React.useState(false);
  const [lastScanTime, setLastScanTime] = React.useState<number>(0);

  const handleDateChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (!dates || !dates[0] || !dates[1]) return;
    
    const diffYears = dates[1].diff(dates[0], 'year', true);
    if (diffYears > 2) {
      message.error('时间范围不能超过2年');
      return;
    }
    
    setFilter({
      ...filter,
      dateRange: [dates[0], dates[1]]
    });
  };

  const handleScan = async () => {
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
                // 刷新数据
                onSearch();
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
        onSearch();
      } else {
        // 未开始（不应该发生）
        setScanning(false);
        message.warning('扫描状态异常');
      }
    } catch (error) {
      setScanning(false);
      message.error('扫描失败');
    }
  };

  // 重置筛选条件
  const handleReset = () => {
    const resetFilter = {
      dateRange: [dayjs().subtract(1, 'month'), dayjs()] as [Dayjs, Dayjs],
      repositoryIds: [] as string[],
      isOvertime: undefined as boolean | undefined
    };
    setFilter(resetFilter);
    message.success('已重置筛选条件');
    // 重置后立即使用新的 filter 值触发搜索
    onSearch(resetFilter);
  };

  // DatePicker 预设范围
  const rangePresets = [
    { label: '最近一周', value: [dayjs().subtract(7, 'day'), dayjs()] as [Dayjs, Dayjs] },
    { label: '最近一个月', value: [dayjs().subtract(1, 'month'), dayjs()] as [Dayjs, Dayjs] },
    { label: '最近三个月', value: [dayjs().subtract(3, 'month'), dayjs()] as [Dayjs, Dayjs] },
    { label: '最近半年', value: [dayjs().subtract(6, 'month'), dayjs()] as [Dayjs, Dayjs] },
    { label: '最近一年', value: [dayjs().subtract(1, 'year'), dayjs()] as [Dayjs, Dayjs] },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Space wrap size="middle">
        <RangePicker
          value={filter.dateRange}
          onChange={handleDateChange}
          format="YYYY-MM-DD"
          allowClear={false}
          presets={rangePresets}
          style={{ width: 280 }}
        />
        
        <Select
          mode="multiple"
          placeholder="选择仓库（默认全部）"
          value={filter.repositoryIds}
          onChange={(ids) => setFilter({ ...filter, repositoryIds: ids })}
          style={{ minWidth: 240 }}
          allowClear
          maxTagCount="responsive"
        >
          {repositories.map((repo: Repository) => (
            <Option key={repo.id} value={repo.id}>
              {repo.name}
            </Option>
          ))}
        </Select>

        <Select
          placeholder="是否加班（默认全部）"
          value={filter.isOvertime === undefined ? null : filter.isOvertime}
          onChange={(value) => {
            setFilter({ 
              ...filter, 
              isOvertime: value === null || value === undefined ? undefined : value 
            });
          }}
          style={{ width: 150 }}
          allowClear
        >
          <Option value={true}>仅加班</Option>
          <Option value={false}>非加班</Option>
        </Select>
        
        <Button 
          type="primary" 
          icon={<SearchOutlined />}
          onClick={() => onSearch()}
        >
          搜索
        </Button>

        <Button 
          icon={<UndoOutlined />}
          onClick={handleReset}
        >
          重置
        </Button>
      </Space>
      
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#ff9800',
            colorPrimaryHover: '#f57c00',
            colorPrimaryActive: '#e65100',
          },
        }}
      >
        <Button 
          type="primary"
          icon={<ReloadOutlined />}
          onClick={handleScan}
          loading={scanning}
          disabled={scanning}
          style={{ marginLeft: 'auto' }}
        >
          手动扫描
        </Button>
      </ConfigProvider>
    </div>
  );
};

