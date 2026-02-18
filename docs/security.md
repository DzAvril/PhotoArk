# 加密与密钥管理

## 本地到网盘加密

- 算法：AES-256-GCM（每文件随机 IV）
- 新文件格式：`[MAGIC:PARK][VER:1][KEY_ID(8)][IV(12)][TAG(16)][CIPHERTEXT]`
- 兼容旧文件格式：`[IV(12)][TAG(16)][CIPHERTEXT]`

## 密钥策略

- 主密钥来自环境变量 `MASTER_KEY_BASE64`（32 字节）
- 支持通过 `LEGACY_MASTER_KEYS_BASE64` 注入旧密钥用于解密（逗号分隔）
- 不在数据库中保存明文密钥

## WebUI 解密预览（115）

- API 鉴权 + 审计日志
- 明文只存在于内存流，不写临时盘
- 一次性 token + 短 TTL
- 默认禁止批量明文导出
