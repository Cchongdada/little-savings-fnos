# 小小攒 · 飞牛 fnOS 澳门代金券账本

手机浏览器使用的澳门代金券攒钱账本，目标默认是 Apple Watch S12（3298 MOP）。首次创建账本时预填面额 120 MOP、实付 80 MOP 的代金券；购买日期和人民币实际扣款未知时保持空白。

## 功能

- 每笔记录面额、实付 MOP、自动计算的优惠，以及可选的实际人民币扣款或购买时汇率。人民币成本优先采用实际扣款。
- NAS 联网获取 MOP→CNY 参考汇率，支持缓存、手动刷新和备用汇率。当前参考价与历史人民币实际成本分开显示。
- 账本、汇率缓存和备份存于 fnOS 应用共享文件夹；手机网址和桌面图标使用同一份数据。
- 账本密码、保持登录、主动退出、通过旧密码修改密码；修改密码后现有会话失效。
- 原子保存、修改前自动备份、JSON 导出和恢复、并发修订冲突保护。

## 安装

适用已安装 Node.js v22 应用（标识 `nodejs_v22`）的 x86_64 飞牛 fnOS。下载 [1.1.2 FPK](release/little-savings-1.1.2-x86.fpk)，核对 [SHA-256](release/SHA256.txt)，然后在应用中心手动安装。安装时设置账本访问密码。安装完成后，手机在可访问 NAS 的网络中打开 `http://NAS-IP:18760/`，或使用飞牛桌面图标。

已有账本在安装或升级前应先导出 JSON，并另存应用共享文件夹中的 `ledger.json`、`auth.json` 和 `backups/`。操作时不要选择删除应用数据。本项目仓库和 FPK **不包含个人账本数据或密码**。

## 源码与验证

服务仅依赖 Node.js v22 标准库。源代码位于 `little-savings/`，后端和包结构检查位于 `tests/`。在支持 `fnpack` 的 fnOS 环境中执行：

```sh
chmod +x little-savings/cmd/*
node tests/backend.mjs
python3 tests/lifecycle.py
fnpack build --directory little-savings
python3 tests/package.py little-savings.fpk
```

1.1.2 在 x86_64 fnOS 测试机上通过后端 43 项检查、生命周期检查、FPK 结构校验，并成功作为 FPK 安装运行。飞牛代理访问的登录、退出和密码修改入口已验证；具体安装流程可能随 fnOS 版本变化。

## 数据保护

应用共享目录名为 `little-savings/data`，实际卷路径由 fnOS 提供。不要把其中的 `auth.json`、`ledger.json`、`exchange-rate.json` 或 `backups/` 提交到公开仓库。忘记密码时可在飞牛应用配置向导中重设，账本记录不受影响。

