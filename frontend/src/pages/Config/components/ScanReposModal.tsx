import React from 'react';
import {
  Modal,
  Input,
  Button,
  Table,
  Space,
  message,
  Typography,
  Form
} from 'antd';
import { FolderOpenOutlined, SearchOutlined, DeleteOutlined, ArrowLeftOutlined, UserOutlined } from '@ant-design/icons';
import { useAtom, useStore } from 'jotai';
import {
  scanDirectoryForRepos,
  batchCreateRepositories,
  type ScannedRepoItem
} from '../../../services/configApi';
import { scannedReposListAtom, type EditableScanItem } from '../../../biz/atoms/scanRepos.atom';

interface ScanReposModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type StepType = 'input' | 'preview' | 'settings';

const ScanReposModal: React.FC<ScanReposModalProps> = ({ open, onClose, onSuccess }) => {
  const [rootPath, setRootPath] = React.useState('');
  const [step, setStep] = React.useState<StepType>('input');
  const [loading, setLoading] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const [list, setList] = useAtom(scannedReposListAtom);
  const store = useStore();
  const [form] = Form.useForm<{ authorName: string; authorEmail: string }>();

  const handleClose = () => {
    setRootPath('');
    setStep('input');
    setList([]);
    form.resetFields();
    onClose();
  };

  const handleScan = async () => {
    const path = rootPath.trim();
    if (!path) {
      message.warning('请输入要扫描的根目录路径');
      return;
    }
    setScanning(true);
    setList([]);
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

  /** 从预览进入批量设置步骤：校验后进入，保存时从 store 读取当前列表（即用户筛选后的数据） */
  const handleGoToSettings = () => {
    const currentList = store.get(scannedReposListAtom);
    if (currentList.length === 0) {
      message.warning('没有可保存的仓库');
      return;
    }
    const ids = currentList.map((r) => r.id);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      message.error('存在重复的仓库 ID，请修改后再保存');
      return;
    }
    form.setFieldsValue({
      authorName: form.getFieldValue('authorName') ?? '',
      authorEmail: form.getFieldValue('authorEmail') ?? ''
    });
    setStep('settings');
  };

  const handleSave = async () => {
    const values = await form.validateFields().catch(() => null);
    if (values === null) return;
    const { authorName, authorEmail } = values;
    const currentList = store.get(scannedReposListAtom);
    if (currentList.length === 0) {
      message.warning('没有可保存的仓库，请返回预览步骤确认列表');
      return;
    }

    const repositories = currentList.map((item) => ({
      id: item.id,
      name: item.name,
      path: item.path,
      enabled: true
    }));

    setLoading(true);
    try {
      await batchCreateRepositories({
        repositories,
        author: { name: authorName, email: authorEmail }
      });
      message.success(`已添加 ${currentList.length} 个仓库并应用批量设置`);
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

  const isInput = step === 'input';
  const isPreview = step === 'preview';
  const isSettings = step === 'settings';

  const modalTitle = isInput
    ? '扫描仓库'
    : isPreview
      ? '确认扫描结果'
      : '批量设置（作者）';

  return (
    <Modal
      title={modalTitle}
      open={open}
      onCancel={handleClose}
      footer={null}
      width={isSettings ? 520 : 1080}
      destroyOnClose
    >
      {isInput && (
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
      )}

      {isPreview && (
        <div>
          <div className="mb-3 flex justify-between items-center">
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => {
                setStep('input');
                setList([]);
              }}
              aria-label="返回"
            >
              返回
            </Button>
            <Typography.Text type="secondary">共 {list.length} 个仓库，可编辑名称/ID 或删除后进入下一步设置</Typography.Text>
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
            <Button type="primary" loading={loading} onClick={handleGoToSettings}>
              下一步：批量设置
            </Button>
          </div>
        </div>
      )}

      {isSettings && (
        <div>
          <Typography.Paragraph type="secondary" className="mb-4">
            以下设置将应用到本次添加的 {list.length} 个仓库。作者信息需与 Git 提交一致。
          </Typography.Paragraph>
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              authorName: '',
              authorEmail: ''
            }}
          >
            <Form.Item
              label="作者姓名"
              name="authorName"
              normalize={(v) => (typeof v === 'string' ? v.trim() : v)}
              rules={[{ required: true, message: '请输入作者姓名' }]}
              extra="与 Git 提交中的作者一致时用于过滤统计"
            >
              <Input prefix={<UserOutlined />} placeholder="例如：张三" />
            </Form.Item>
            <Form.Item
              label="作者邮箱"
              name="authorEmail"
              normalize={(v) => (typeof v === 'string' ? v.trim() : v)}
              rules={[
                { required: true, message: '请输入作者邮箱' },
                { type: 'email', message: '请输入有效的邮箱格式' }
              ]}
              extra="需与 Git 提交记录中的邮箱一致"
            >
              <Input type="email" placeholder="例如：zhangsan@example.com" />
            </Form.Item>
          </Form>
          <div className="mt-4 flex justify-between">
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => setStep('preview')}
              aria-label="上一步"
            >
              上一步
            </Button>
            <div className="flex gap-2">
              <Button onClick={handleClose}>取消</Button>
              <Button type="primary" loading={loading} onClick={handleSave}>
                确认并保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ScanReposModal;
