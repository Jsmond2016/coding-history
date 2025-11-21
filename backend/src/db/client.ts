import { PrismaClient } from '@prisma/client';

// 创建 Prisma Client 实例
// Prisma 7 会自动从 prisma.config.ts 读取配置
export const prisma = new PrismaClient();

// 导出 prisma 作为 db 的别名，保持向后兼容
export const db = prisma;

