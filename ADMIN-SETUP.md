# 后台部署说明

## 1. 在 Vercel 添加服务

1. 打开 Vercel 项目 → **Storage** → **Create Database**
2. 选择 **Postgres**，创建
3. 选择 **Blob**，创建
4. 两个服务创建后，Vercel 会自动把 `POSTGRES_URL`、`BLOB_READ_WRITE_TOKEN` 等环境变量加到项目

## 2. 添加环境变量

在 Vercel 项目 **Settings** → **Environment Variables** 中添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `ADMIN_USERNAME` | `lgchgh` | 登录用户名 |
| `ADMIN_PASSWORD` | `lg697280` | 登录密码（建议上线后修改） |
| `JWT_SECRET` | 随机字符串 | 用于 session，可填 `your-random-secret-here` |
| `INIT_SECRET` | 随机字符串 | 初始化数据库用，执行一次后可删除 |

## 3. 初始化数据库

部署完成后，在浏览器访问：

```
https://你的域名.vercel.app/api/init-db?secret=你的INIT_SECRET
```

看到 `{"success":true,"message":"Database initialized"}` 表示成功。之后可删除 `INIT_SECRET` 环境变量。

## 4. 登录后台

访问 `https://你的域名.vercel.app/admin`，用 `lgchgh` / `lg697280` 登录。

## 5. 后台功能

- **Pages**：编辑首页、About、Contact、Privacy、Terms 的文字内容
- **Gallery**：添加、编辑、删除图片，修改 caption，上传新图
- **Posts**：发布、编辑、删除博文，支持 HTML 内容
- **Visitors**：查看访客总数、按页面统计、按来源（Referrer）统计、最近访问记录

## 6. 安全建议

- 上线后修改 `ADMIN_PASSWORD`
- 使用强密码：`node scripts/hash-password.js 新密码` 生成 hash，设置 `ADMIN_PASSWORD_HASH` 替代 `ADMIN_PASSWORD`
