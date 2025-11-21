# 快速开始指南

## 🚀 5 分钟上手

### 1️⃣ 安装（选择一种方式）

#### 方式 A：自动安装（推荐）

```bash
cd /Users/huangjing/Desktop/MyCode/temp/coding-history/scripts
./install.sh
```

选择选项 1（安装到 /usr/local/bin）或选项 2（安装到 ~/.local/bin）

#### 方式 B：临时使用（无需安装）

```bash
cd /Users/huangjing/Desktop/MyCode/temp/coding-history/scripts
./findport 3000
./killport 3000
```

### 2️⃣ 基本使用

#### 查找端口占用

```bash
findport 3000
```

#### 关闭端口进程

```bash
killport 3000
```

#### 强制关闭

```bash
killport 3000 -f
```

### 3️⃣ 常见场景

#### 场景：启动开发服务器时提示端口被占用

```bash
# 步骤 1: 查看是什么占用了端口
findport 3000

# 步骤 2: 关闭占用端口的进程
killport 3000

# 步骤 3: 重新启动你的服务器
npm run dev
```

#### 场景：清理多个开发端口

```bash
# React 前端
killport 3000

# Node.js 后端
killport 5000

# 数据库
killport 5432
```

## 📝 命令速查表

| 命令 | 说明 | 示例 |
|------|------|------|
| `findport <port>` | 查找端口占用 | `findport 3000` |
| `killport <port>` | 关闭端口进程 | `killport 3000` |
| `killport <port> -f` | 强制关闭 | `killport 3000 -f` |

## ⚠️ 注意事项

1. **关闭前确认**：killport 会要求你确认，输入 `y` 继续
2. **权限问题**：关闭系统端口（如 80, 443）可能需要 `sudo`
3. **强制关闭**：使用 `-f` 选项会立即终止进程，可能导致数据丢失

## 🎯 实用技巧

### 技巧 1：创建别名（更短的命令）

编辑 `~/.zshrc` 或 `~/.bashrc`：

```bash
alias fp='findport'
alias kp='killport'
```

然后：

```bash
source ~/.zshrc
fp 3000
kp 3000
```

### 技巧 2：一键重启服务

创建一个函数：

```bash
# 添加到 ~/.zshrc
restart_port() {
    killport $1 && sleep 1 && echo "端口 $1 已释放，可以重启服务了"
}
```

使用：

```bash
restart_port 3000
```

### 技巧 3：批量清理端口

```bash
# 清理常用开发端口
for port in 3000 5000 8080 8000; do
    killport $port -f
done
```

## 🆘 遇到问题？

### 问题：命令未找到

```bash
# 检查是否安装成功
which findport
which killport

# 如果没有，重新运行安装脚本
cd /Users/huangjing/Desktop/MyCode/temp/coding-history/scripts
./install.sh
```

### 问题：权限被拒绝

```bash
# 添加执行权限
chmod +x /Users/huangjing/Desktop/MyCode/temp/coding-history/scripts/findport
chmod +x /Users/huangjing/Desktop/MyCode/temp/coding-history/scripts/killport

# 或使用 sudo（如果需要）
sudo killport 80
```

### 问题：找不到进程

```bash
# 使用 sudo 查看所有进程
sudo findport 3000

# 手动检查
lsof -i :3000
```

## 📚 更多信息

查看完整文档：[README.md](./README.md)

---

**享受更高效的开发体验！** 🎉

