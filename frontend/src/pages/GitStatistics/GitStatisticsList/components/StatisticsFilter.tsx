import React from 'react';
import { Space, DatePicker, Select, Button, message } from 'antd';
import { SearchOutlined, ReloadOutlined, UndoOutlined } from '@ant-design/icons';
import { useAtom } from 'jotai';
import dayjs, { type Dayjs } from 'dayjs';
import { filterAtom, repositoriesAtom } from '../../../../biz/atoms/gitStatistics.atom';
import { gitStatisticsApi } from '../../../../services/gitStatisticsApi';
import type { Repository } from '../../../../types/gitStatistics';

const { RangePicker } = DatePicker;
const { Option } = Select;

interface StatisticsFilterProps {
  onSearch: () => void;
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
      const result = await gitStatisticsApi.triggerScan();
      if (result.success) {
        message.success(`成功扫描 ${result.scannedCount} 个仓库`);
        // 扫描成功后自动刷新数据
        onSearch();
      } else {
        message.error('扫描失败');
      }
    } catch (error) {
      message.error('扫描失败');
    } finally {
      setScanning(false);
    }
  };

  // 重置筛选条件
  const handleReset = () => {
    setFilter({
      dateRange: [dayjs().subtract(1, 'month'), dayjs()],
      repositoryIds: [],
      isOvertime: undefined
    });
    // 重置后自动搜索
    setTimeout(() => {
      onSearch();
    }, 0);
    message.success('已重置筛选条件');
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
        onClick={onSearch}
      >
        搜索
      </Button>

      <Button 
        icon={<UndoOutlined />}
        onClick={handleReset}
      >
        重置
      </Button>
      
      {/* <Button 
        icon={<ReloadOutlined />}
        onClick={handleScan}
        loading={scanning}
        disabled={scanning}
      >
        手动扫描
      </Button> */}
    </Space>
  );
};

