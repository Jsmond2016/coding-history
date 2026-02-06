import { atom } from 'jotai';
import type { ScannedRepoItem } from '../../services/configApi';

export interface EditableScanItem extends ScannedRepoItem {
  key: string;
}

/** 扫描仓库弹窗中的列表（预览步骤可编辑/删减），提交时从 store 读取即用户筛选后的数据 */
export const scannedReposListAtom = atom<EditableScanItem[]>([]);
