# 加密与密钥管理

## 本地到网盘加密

- 算法：AES-256-GCM（每文件随机 IV）
- 文件格式：`[IV(12)][TAG(16)][CIPHERTEXT]`
- 元数据：记录 key version、原始 mime、hash

## 密钥策略

- 主密钥来自环境变量 `MASTER_KEY_BASE64`（32 字节）
- 支持 key version（后续实现轮换）
- 不在数据库中保存明文密钥

## WebUI 解密预览（115）

- API 鉴权 + 审计日志
- 明文只存在于内存流，不写临时盘
- 一次性 token + 短 TTL
- 默认禁止批量明文导出
