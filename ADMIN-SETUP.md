# 后台部署说明

## 自动部署（推荐）

1. 将本仓库推送到 **GitHub / GitLab / Bitbucket**（任选其一均可被 Vercel 连接）。
2. 打开 [Vercel Dashboard](https://vercel.com/dashboard) → **Add New…** → **Project** → 选中该仓库并 **Import**。
3. 使用项目内的 `vercel.json`（Framework Preset 选 **Other**、Root Directory 为仓库根目录即可），其余与下文「部署前准备」「环境变量」一致。
4. 保存后，**每次往 Production 分支（通常为 `main`）推送**，Vercel 会自动构建并上线；**其他分支 / Pull Request** 会生成 **Preview** 预览地址。

若仓库已挂在该项目上，只需日常 `git push`，无需手动在 Vercel 点 Deploy。

---

## 0. 部署前准备（若构建失败）

若 Vercel 在 "Installing dependencies" 阶段失败，可尝试：

1. **本地生成 lock 文件**：在项目根目录运行 `npm install`，将生成的 `package-lock.json` 提交并推送
2. **Vercel 项目设置**：
   - Framework Preset 选 **Other**
   - Root Directory 保持 `./`
   - 在 **Settings → General** 中确认 Node.js 版本为 **20.x**
3. **环境变量**：若设置了 `NODE_ENV=production`，可暂时移除，避免影响依赖安装

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
| `RESEND_API_KEY` | Resend 后台 API Key | **联系表单发信**（见下文「联系表单 / Resend」） |
| `CONTACT_TO_EMAIL` | 如 `admin@beiaibaking.net` | 访客提交后邮件送达的收件箱（默认与下栏一致可省略） |
| `RESEND_FROM` | 如 `Beiai Baking \<noreply@你的域名>` | 发件人；域名在 Resend 验证前可用 `Beiai Baking \<onboarding@resend.dev>` 测通 |

## 2b. 联系表单 / Resend（与别的网站的「提交成功页」一致）

联系页通过 `/api/contact` 把留言发到你的邮箱，需使用 [Resend](https://resend.com)（免费档可试用）：

1. 注册 Resend → **API Keys** 新建 Key，填入 Vercel 环境变量 **`RESEND_API_KEY`**。
2. **`CONTACT_TO_EMAIL`**：收到信的地址（建议与后台 Site 里的 Contact Email 一致）。不设置则默认为 `admin@beiaibaking.net`。
3. **`RESEND_FROM`**：发件人展示名 + 地址。未完成域名验证前，可用官方测试发件人：  
   `Beiai Baking <onboarding@resend.dev>`（Resend 文档可能有更新，以控制台说明为准）。验证你自己的域名后，改为例如 `Beiai Baking <hello@你的域名>`。
4. 保存环境变量后必须在 Vercel 对项目做一次 **Redeploy**（仅保存变量不会更新已在跑的函数）。  

**自检：** 浏览器打开 `https://你的域名/api/contact`，应看到 JSON：`{"ok":true,"contactApi":true,"resendConfigured":true}`（最后项在已配置 Key 后为 `true`）。若 404，说明尚未部署含 `api/contact.js` 的版本或需 Redeploy。

未配置 `RESEND_API_KEY` 时，提交会提示表单未就绪，仍可使用导航栏邮件图标。

## 3. 初始化数据库

部署完成后，在浏览器访问：

```
https://beiaibaking.net/api/init-db?secret=你的INIT_SECRET
```

看到 `{"success":true,"message":"Database initialized"}` 表示成功。之后可删除 `INIT_SECRET` 环境变量。

## 4. 登录后台

访问 `https://beiaibaking.net/admin`，用 `lgchgh` / `lg697280` 登录。

## 5. 后台功能

- **Pages**：编辑首页、About、Contact、Privacy、Terms 的文字内容
- **Gallery**：添加、编辑、删除图片，修改 caption，上传新图
- **Posts**：发布、编辑、删除博文，支持 HTML 内容
- **Visitors**：查看访客总数、按页面统计、按来源（Referrer）统计、最近访问记录

## 6. 安全建议

- 上线后修改 `ADMIN_PASSWORD`
- 使用强密码：`node scripts/hash-password.js 新密码` 生成 hash，设置 `ADMIN_PASSWORD_HASH` 替代 `ADMIN_PASSWORD`
