import React from 'react';
import {
  Modal,
  Input,
  Button,
  Table,
  Space,
  message,
  Typography
} from 'antd';
import { FolderOpenOutlined, SearchOutlined, DeleteOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { scanDirectoryForRepos, createRepository, type ScannedRepoItem } from '../../../services/configApi';

interface ScanReposModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface EditableScanItem extends ScannedRepoItem {
  key: string;
}

const ScanReposModal: React.FC<ScanReposModalProps> = ({ open, onClose, onSuccess }) => {
  const [rootPath, setRootPath] = React.useState('');
  const [step, setStep] = React.useState<'input' | 'preview'>('input');
  const [loading, setLoading] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const [list, setList] = React.useState<EditableScanItem[]>([]);

  const handleClose = () => {
    setRootPath('');
    setStep('input');
    setList([]);
    onClose();
  };

  const handleScan = async () => {
    const path = rootPath.trim();
    if (!path) {
      message.warning('请输入要扫描的根目录路径');
      return;
    }
    setScanning(true);
    setList([]); // 每次重新扫描前清空上一次结果
    try {
      const repos = await scanDirectoryForRepos(path);
      if (repos.length === 0) {
        message.info('该目录下未发现 Git 仓库');
        return;
      }
      const withKeys: EditableScanItem[] = repos.map((r, i) => ({
        ...r,
        key: `${r.path}-${i}`
      }));
      setList(withKeys);
      setStep('preview');
      message.success(`发现 ${repos.length} 个 Git 仓库`);
    } catch (e) {
      message.error('扫描失败，请检查路径是否正确且后端可访问该目录');
      console.error(e);
    } finally {
      setScanning(false);
    }
  };

  const updateItem = (key: string, field: keyof ScannedRepoItem, value: string) => {
    setList((prev) =>
      prev.map((item) => (item.key === key ? { ...item, [field]: value } : item))
    );
  };

  const removeItem = (key: string) => {
    setList((prev) => prev.filter((item) => item.key !== key));
  };

  const handleSave = async () => {
    if (list.length === 0) {
      message.warning('没有可保存的仓库');
      return;
    }
    const ids = list.map((r) => r.id);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      message.error('存在重复的仓库 ID，请修改后再保存');
      return;
    }
    setLoading(true);
    try {
      for (const item of list) {
        await createRepository({
          id: item.id,
          name: item.name,
          path: item.path,
          enabled: true
        });
      }
      message.success(`已添加 ${list.length} 个仓库`);
      handleClose();
      onSuccess();
    } catch (e) {
      message.error('保存失败');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (val: string, record: EditableScanItem) => (
        <Input
          value={val}
          onChange={(e) => updateItem(record.key, 'name', e.target.value)}
          placeholder="仓库名称"
        />
      )
    },
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 160,
      render: (val: string, record: EditableScanItem) => (
        <Input
          value={val}
          onChange={(e) => updateItem(record.key, 'id', e.target.value.replace(/\s/g, '-'))}
          placeholder="唯一标识"
        />
      )
    },
    {
      title: '路径',
      dataIndex: 'path',
      key: 'path',
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: EditableScanItem) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => removeItem(record.key)}
          aria-label="删除"
        />
      )
    }
  ];

  const isPreview = step === 'preview';

  return (
    <Modal
      title={isPreview ? '确认并保存扫描结果' : '扫描仓库'}
      open={open}
      onCancel={handleClose}
      footer={null}
      width={1080}
      destroyOnClose
    >
      {!isPreview ? (
        <div>
          <Typography.Paragraph type="secondary" className="mb-2">
            输入要扫描的根目录绝对路径（如 /Users/xxx/Desktop/Code），将自动识别该目录及子目录下的所有 Git 仓库。
          </Typography.Paragraph>
          <Space.Compact className="w-full">
            <Input
              prefix={<FolderOpenOutlined />}
              placeholder="例如：/Users/你的用户名/Desktop/Code"
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
              onPressEnter={handleScan}
              aria-label="根目录路径"
            />
            <Button type="primary" icon={<SearchOutlined />} loading={scanning} onClick={handleScan}>
              开始扫描
            </Button>
          </Space.Compact>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex justify-between items-center">
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => {
                setStep('input');
                setList([]); // 返回时清空本次扫描结果，避免与下次扫描混淆
              }}
              aria-label="返回"
            >
              返回
            </Button>
            <Typography.Text type="secondary">共 {list.length} 个仓库，可编辑名称/ID 或删除后保存</Typography.Text>
          </div>
          <Table
            columns={columns}
            dataSource={list}
            rowKey="key"
            pagination={false}
            scroll={{ y: 320 }}
            size="small"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={handleClose}>取消</Button>
            <Button type="primary" loading={loading} onClick={handleSave}>
              确认并保存
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ScanReposModal;
